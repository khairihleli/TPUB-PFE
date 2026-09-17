package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.OcrEngine;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class OcrServicesTest {

    @TempDir
    Path tempDir;

    private final SimulatedOcrService simulated = new SimulatedOcrService();

    @Test
    void simulatedOcrUsesMeaningfulFileNameTokens() {
        assertThat(simulated.extract(null, "WhatsApp Image 2024-05-01 promo_soldes-été.JPEG"))
                .isEqualTo(new OcrService.OcrResult("promo soldes été", OcrEngine.SIMULE));
        assertThat(simulated.extract(null, "IMG_20240501_123456.jpg")).isEqualTo(OcrService.OcrResult.none());
        assertThat(simulated.extract(null, "ab.png")).isEqualTo(OcrService.OcrResult.none());
        assertThat(simulated.extract(null, null)).isEqualTo(OcrService.OcrResult.none());
    }

    @Test
    void tesseractIsUsedWhenTheCommandSucceeds() throws IOException {
        Path image = Files.writeString(tempDir.resolve("affiche.png"), "fake");
        AtomicInteger calls = new AtomicInteger();
        TesseractOcrService service = new TesseractOcrService(properties("auto"), simulated, (command, timeout) -> {
            calls.incrementAndGet();
            if (command.contains("--version")) {
                return new TesseractOcrService.CommandResult(0, "tesseract 5.3", false);
            }
            assertThat(command).containsSequence(image.toAbsolutePath().toString(), "stdout", "-l", "fra+eng");
            return new TesseractOcrService.CommandResult(0, "  SOLDES\n -50%  ", false);
        });

        assertThat(service.isAvailable()).isTrue();
        assertThat(service.isAvailable()).isTrue();
        assertThat(service.extract(image, "affiche.png")).isEqualTo(new OcrService.OcrResult("SOLDES -50%", OcrEngine.TESSERACT));
        assertThat(calls.get()).isEqualTo(2); // probe cached
    }

    @Test
    void tesseractFailuresFallBackToSimulatedOcr() throws IOException {
        Path image = Files.writeString(tempDir.resolve("x.png"), "fake");
        TesseractOcrService failing = new TesseractOcrService(properties("tesseract"), simulated,
                (command, timeout) -> new TesseractOcrService.CommandResult(1, "", false));
        assertThat(failing.extract(image, "promo-casino.png"))
                .isEqualTo(new OcrService.OcrResult("promo casino", OcrEngine.SIMULE));

        TesseractOcrService missingBinary = new TesseractOcrService(properties("auto"), simulated, (command, timeout) -> {
            throw new IOException("Cannot run program \"tesseract\"");
        });
        assertThat(missingBinary.isAvailable()).isFalse();
        assertThat(missingBinary.extract(image, "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);

        TesseractOcrService timeout = new TesseractOcrService(properties("auto"), simulated,
                (command, t) -> new TesseractOcrService.CommandResult(-1, null, true));
        assertThat(timeout.extract(image, "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);
        assertThat(timeout.extract(tempDir.resolve("absent.png"), "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);
    }

    @Test
    void resolverFollowsTheConfiguredMode() {
        TesseractOcrService unavailable = new TesseractOcrService(properties("auto"), simulated,
                (command, timeout) -> new TesseractOcrService.CommandResult(127, "", false));
        TesseractOcrService available = new TesseractOcrService(properties("auto"), simulated,
                (command, timeout) -> new TesseractOcrService.CommandResult(0, "", false));

        assertThat(new OcrServiceResolver(properties("auto"), unavailable, simulated).select()).isSameAs(simulated);
        assertThat(new OcrServiceResolver(properties("auto"), available, simulated).select()).isSameAs(available);
        assertThat(new OcrServiceResolver(properties("simulated"), available, simulated).select()).isSameAs(simulated);
        assertThat(new OcrServiceResolver(properties("tesseract"), unavailable, simulated).select()).isSameAs(unavailable);
    }

    private static TpubProperties properties(String mode) {
        TpubProperties properties = new TpubProperties();
        properties.getAi().getOcr().setMode(mode);
        return properties;
    }
}
