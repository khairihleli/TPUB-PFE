package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.OcrEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * OCR through the {@code tesseract} command line, only when it is installed. Any failure falls back to the
 * simulated OCR, so no native dependency is ever required.
 */
@Slf4j
@Component
public class TesseractOcrService implements OcrService {

    static final Duration PROBE_TIMEOUT = Duration.ofSeconds(5);
    static final Duration RUN_TIMEOUT = Duration.ofSeconds(20);

    /** Runs an external command; abstracted for tests. */
    @FunctionalInterface
    interface CommandRunner {
        CommandResult run(List<String> command, Duration timeout) throws IOException, InterruptedException;
    }

    record CommandResult(int exitCode, String stdout, boolean timedOut) {
    }

    private final TpubProperties properties;
    private final SimulatedOcrService fallback;
    private final CommandRunner runner;
    private volatile Boolean available;

    @Autowired
    public TesseractOcrService(TpubProperties properties, SimulatedOcrService fallback) {
        this(properties, fallback, TesseractOcrService::runProcess);
    }

    TesseractOcrService(TpubProperties properties, SimulatedOcrService fallback, CommandRunner runner) {
        this.properties = properties;
        this.fallback = fallback;
        this.runner = runner;
    }

    /** {@code tesseract --version} exits 0 within 5 s. Probed once, lazily. */
    public boolean isAvailable() {
        Boolean cached = available;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (available == null) {
                available = probe();
            }
            return available;
        }
    }

    private boolean probe() {
        try {
            CommandResult result = runner.run(List.of(command(), "--version"), PROBE_TIMEOUT);
            boolean ok = !result.timedOut() && result.exitCode() == 0;
            log.info("Tesseract OCR {}", ok ? "détecté" : "indisponible (code " + result.exitCode() + ")");
            return ok;
        } catch (IOException ex) {
            log.info("Tesseract OCR indisponible : {}", ex.getMessage());
            return false;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    @Override
    public OcrResult extract(Path file, String originalFileName) {
        if (file == null || !Files.isRegularFile(file)) {
            return fallback.extract(file, originalFileName);
        }
        try {
            CommandResult result = runner.run(
                    List.of(command(), file.toAbsolutePath().toString(), "stdout", "-l", languages()), RUN_TIMEOUT);
            if (result.timedOut() || result.exitCode() != 0) {
                log.warn("Tesseract a échoué pour {} (code {}, délai dépassé : {}) — OCR simulé appliqué",
                        originalFileName, result.exitCode(), result.timedOut());
                return fallback.extract(file, originalFileName);
            }
            String text = result.stdout() == null ? "" : result.stdout().replaceAll("\\s+", " ").trim();
            return text.isEmpty() ? OcrResult.none() : new OcrResult(text, OcrEngine.TESSERACT);
        } catch (IOException ex) {
            log.warn("Tesseract indisponible pour {} : {} — OCR simulé appliqué", originalFileName, ex.getMessage());
            return fallback.extract(file, originalFileName);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return fallback.extract(file, originalFileName);
        }
    }

    private String command() {
        String command = properties.getAi().getOcr().getCommand();
        return command == null || command.isBlank() ? "tesseract" : command;
    }

    private String languages() {
        String languages = properties.getAi().getOcr().getLanguages();
        return languages == null || languages.isBlank() ? "fra+eng" : languages;
    }

    private static CommandResult runProcess(List<String> command, Duration timeout) throws IOException, InterruptedException {
        File output = File.createTempFile("tpub-ocr-", ".txt");
        try {
            Process process = new ProcessBuilder(command)
                    .redirectOutput(output)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
            boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new CommandResult(-1, null, true);
            }
            String stdout = Files.readString(output.toPath(), StandardCharsets.UTF_8);
            return new CommandResult(process.exitValue(), stdout, false);
        } finally {
            Files.deleteIfExists(output.toPath());
        }
    }
}
