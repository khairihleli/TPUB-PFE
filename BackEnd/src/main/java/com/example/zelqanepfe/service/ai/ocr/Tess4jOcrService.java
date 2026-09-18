package com.example.zelqanepfe.service.ai.ocr;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.OcrEngine;
import com.example.zelqanepfe.service.ai.OcrService;
import com.example.zelqanepfe.service.ai.SimulatedOcrService;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import net.sourceforge.tess4j.ITessAPI;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.Word;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Real OCR through Tess4J (docs/round2-contract.md §2.2). Availability is probed once, lazily: every configured
 * language must have its {@code .traineddata} file and the native library must load. When the probe fails, or a
 * recognition times out or fails, the simulated OCR answers instead; this service never throws.
 */
@Slf4j
@Component
public class Tess4jOcrService implements OcrService {

    static final int UPSCALE_BELOW = 1000;
    static final int DOWNSCALE_ABOVE = 2000;
    static final String FETCH_HINT = "Lancez BackEnd/scripts/fetch-tessdata.ps1";

    /** One recognised word, in the coordinates of the image given to the engine. */
    public record RecognizedWord(String text, float confidence, int x, int y, int w, int h) {
    }

    /** Word recognition on a prepared grayscale image. One instance per task, never shared between threads. */
    @FunctionalInterface
    public interface WordEngine {
        List<RecognizedWord> recognize(BufferedImage image) throws Exception;
    }

    @FunctionalInterface
    public interface EngineFactory {
        WordEngine create(String datapath, String languages);
    }

    /** Probe outcome, exposed by {@code GET /api/ai/providers}. */
    public record Status(boolean available, boolean tessdataPresent, String reason) {
    }

    public record Prepared(BufferedImage image, double scale) {
    }

    private final AiAnalysisProperties properties;
    private final SimulatedOcrService fallback;
    private final EngineFactory engineFactory;
    private volatile Status status;
    private volatile ExecutorService executor;

    @Autowired
    public Tess4jOcrService(AiAnalysisProperties properties, SimulatedOcrService fallback) {
        this(properties, fallback, Tess4jOcrService::tess4jEngine);
    }

    public Tess4jOcrService(AiAnalysisProperties properties, SimulatedOcrService fallback, EngineFactory engineFactory) {
        this.properties = properties;
        this.fallback = fallback;
        this.engineFactory = engineFactory;
    }

    public boolean isAvailable() {
        return status().available();
    }

    public Status status() {
        Status cached = status;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (status == null) {
                status = probe();
            }
            return status;
        }
    }

    /** Whether every configured language has its traineddata file (no native library load). */
    public boolean tessdataPresent() {
        return missingLanguages().isEmpty();
    }

    @Override
    public OcrResult extract(Path file, String originalFileName) {
        if (file == null || !Files.isRegularFile(file) || !isAvailable()) {
            return fallback.extract(file, originalFileName);
        }
        BufferedImage image;
        try {
            image = ImageIO.read(file.toFile());
        } catch (Exception ex) {
            image = null;
        }
        if (image == null) {
            return OcrResult.none();
        }
        return extractImage(image, file, originalFileName);
    }

    @Override
    public OcrResult extractImage(BufferedImage image, Path file, String originalFileName) {
        if (!isAvailable()) {
            return fallback.extract(file, originalFileName);
        }
        if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
            return OcrResult.none();
        }
        Prepared prepared = prepare(image);
        WordEngine engine = engineFactory.create(tessdataDir().toString(), languages());
        Future<List<RecognizedWord>> future = executor().submit(() -> engine.recognize(prepared.image()));
        try {
            List<RecognizedWord> words = future.get(Math.max(1, properties.getOcr().getTimeoutSeconds()), TimeUnit.SECONDS);
            return assemble(words, prepared.scale(), properties.getOcr().getMinWordConfidence(),
                    image.getWidth(), image.getHeight());
        } catch (TimeoutException ex) {
            future.cancel(true);
            log.warn("OCR Tesseract trop long pour {} (> {} s) : OCR simulé appliqué", originalFileName,
                    properties.getOcr().getTimeoutSeconds());
            return fallback.extract(file, originalFileName);
        } catch (ExecutionException ex) {
            Throwable cause = ex.getCause() == null ? ex : ex.getCause();
            log.warn("OCR Tesseract en échec pour {} ({}) : OCR simulé appliqué", originalFileName, cause.toString());
            return fallback.extract(file, originalFileName);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            return fallback.extract(file, originalFileName);
        }
    }

    /** ×2 bicubic upscale when the longest side is below 1000 px, downscale above 2000 px, then grayscale. */
    public static Prepared prepare(BufferedImage source) {
        int longest = Math.max(source.getWidth(), source.getHeight());
        double scale = longest < UPSCALE_BELOW ? 2.0 : longest > DOWNSCALE_ABOVE ? (double) DOWNSCALE_ABOVE / longest : 1.0;
        int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage gray = new BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = gray.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(source, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return new Prepared(gray, scale);
    }

    /** Keeps the words at or above the confidence floor and maps their boxes back to original pixels. */
    public static OcrResult assemble(List<RecognizedWord> words, double scale, int minConfidence, int width, int height) {
        List<String> texts = new ArrayList<>();
        List<OcrBox> boxes = new ArrayList<>();
        double confidenceSum = 0;
        if (words != null) {
            for (RecognizedWord word : words) {
                if (word == null || word.text() == null || word.text().isBlank() || word.confidence() < minConfidence) {
                    continue;
                }
                texts.add(word.text().trim());
                confidenceSum += word.confidence();
                int x = clamp((int) Math.floor(word.x() / scale), 0, width);
                int y = clamp((int) Math.floor(word.y() / scale), 0, height);
                int w = clamp((int) Math.ceil(word.w() / scale), 0, width - x);
                int h = clamp((int) Math.ceil(word.h() / scale), 0, height - y);
                boxes.add(new OcrBox(x, y, w, h, word.confidence()));
            }
        }
        if (texts.isEmpty()) {
            return new OcrResult(null, OcrEngine.TESSERACT, List.of(), null);
        }
        String text = String.join(" ", texts).replaceAll("\\s+", " ").trim();
        double mean = Math.round(confidenceSum / texts.size() * 10d) / 10d;
        return new OcrResult(text, OcrEngine.TESSERACT, boxes, mean);
    }

    private Status probe() {
        List<String> missing = missingLanguages();
        if (!missing.isEmpty()) {
            String reason = "données manquantes : " + String.join(", ", missing) + " dans " + tessdataDir();
            log.warn("OCR Tesseract indisponible ({}) : OCR simulé utilisé. {}", reason, FETCH_HINT);
            return new Status(false, false, reason);
        }
        try {
            BufferedImage pixel = new BufferedImage(1, 1, BufferedImage.TYPE_BYTE_GRAY);
            engineFactory.create(tessdataDir().toString(), languages()).recognize(pixel);
            log.info("OCR Tesseract (Tess4J) actif : langues {}, données {}", languages(), tessdataDir());
            return new Status(true, true, null);
        } catch (LinkageError | Exception ex) {
            String reason = "bibliothèque native introuvable ou invalide : " + ex;
            log.warn("OCR Tesseract indisponible ({}) : OCR simulé utilisé. {}", reason, FETCH_HINT);
            return new Status(false, true, reason);
        }
    }

    List<String> missingLanguages() {
        Path dir = tessdataDir();
        return Arrays.stream(languages().split("\\+"))
                .map(String::trim)
                .filter(lang -> !lang.isEmpty())
                .filter(lang -> !Files.isRegularFile(dir.resolve(lang + ".traineddata")))
                .map(lang -> lang + ".traineddata")
                .toList();
    }

    public String languages() {
        String languages = properties.getOcr().getLanguages();
        return languages == null || languages.isBlank() ? "fra+eng+ara" : languages.trim();
    }

    private Path tessdataDir() {
        String path = properties.getOcr().getTessdataPath();
        return Paths.get(path == null || path.isBlank() ? "./tessdata" : path).toAbsolutePath().normalize();
    }

    private ExecutorService executor() {
        ExecutorService current = executor;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (executor == null) {
                AtomicInteger counter = new AtomicInteger();
                executor = Executors.newFixedThreadPool(Math.max(1, properties.getOcr().getMaxThreads()), runnable -> {
                    Thread thread = new Thread(runnable, "zelqane-ocr-" + counter.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
            }
            return executor;
        }
    }

    @PreDestroy
    void shutdown() {
        ExecutorService current = executor;
        if (current != null) {
            current.shutdownNow();
        }
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(Math.max(min, max), value));
    }

    private static WordEngine tess4jEngine(String datapath, String languages) {
        return image -> {
            Tesseract tesseract = new Tesseract();
            tesseract.setDatapath(datapath);
            tesseract.setLanguage(languages);
            tesseract.setPageSegMode(3);
            tesseract.setOcrEngineMode(1);
            List<RecognizedWord> words = new ArrayList<>();
            for (Word word : tesseract.getWords(image, ITessAPI.TessPageIteratorLevel.RIL_WORD)) {
                Rectangle box = word.getBoundingBox();
                words.add(new RecognizedWord(word.getText(), word.getConfidence(),
                        box == null ? 0 : box.x, box == null ? 0 : box.y,
                        box == null ? 0 : box.width, box == null ? 0 : box.height));
            }
            return words;
        };
    }
}
