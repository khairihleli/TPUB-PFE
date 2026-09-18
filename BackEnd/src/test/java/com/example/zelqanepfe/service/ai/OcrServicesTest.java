package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.OcrEngine;
import com.example.zelqanepfe.service.ai.ocr.OcrBox;
import com.example.zelqanepfe.service.ai.ocr.Tess4jOcrService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
    void tess4jIsUsedWhenTessdataAndEngineAreAvailable() throws IOException {
        writeTessdata("fra", "eng", "ara");
        Path image = writeImage("affiche.png", 400, 200);
        AtomicInteger calls = new AtomicInteger();
        Tess4jOcrService service = new Tess4jOcrService(properties("auto"), simulated, (datapath, languages) -> img -> {
            calls.incrementAndGet();
            assertThat(languages).isEqualTo("fra+eng+ara");
            assertThat(img.getType()).isEqualTo(BufferedImage.TYPE_BYTE_GRAY);
            if (img.getWidth() == 1) {
                return List.of();
            }
            // 400 px wide → upscaled ×2 before recognition
            assertThat(img.getWidth()).isEqualTo(800);
            return List.of(
                    new Tess4jOcrService.RecognizedWord("SOLDES", 91f, 100, 40, 200, 60),
                    new Tess4jOcrService.RecognizedWord("~~", 12f, 0, 0, 10, 10),
                    new Tess4jOcrService.RecognizedWord("-50%", 83f, 320, 40, 120, 60));
        });

        assertThat(service.isAvailable()).isTrue();
        OcrService.OcrResult result = service.extract(image, "affiche.png");
        assertThat(result.text()).isEqualTo("SOLDES -50%");
        assertThat(result.engine()).isEqualTo(OcrEngine.TESSERACT);
        assertThat(result.meanConfidence()).isEqualTo(87.0);
        assertThat(result.boxes()).containsExactly(new OcrBox(50, 20, 100, 30, 91f), new OcrBox(160, 20, 60, 30, 83f));
        assertThat(service.isAvailable()).isTrue();
        assertThat(calls.get()).isEqualTo(2); // probe cached
    }

    @Test
    void missingTessdataFallsBackToSimulatedOcr() throws IOException {
        writeTessdata("fra");
        Path image = writeImage("x.png", 100, 100);
        Tess4jOcrService service = new Tess4jOcrService(properties("auto"), simulated, (datapath, languages) -> img -> {
            throw new AssertionError("engine must not run without tessdata");
        });
        assertThat(service.isAvailable()).isFalse();
        assertThat(service.status().reason()).contains("eng.traineddata", "ara.traineddata");
        assertThat(service.tessdataPresent()).isFalse();
        assertThat(service.extract(image, "promo-casino.png"))
                .isEqualTo(new OcrService.OcrResult("promo casino", OcrEngine.SIMULE));
    }

    @Test
    void nativeLoadFailureTimeoutAndErrorsFallBack() throws IOException {
        writeTessdata("fra", "eng", "ara");
        Path image = writeImage("x.png", 100, 100);

        Tess4jOcrService noNative = new Tess4jOcrService(properties("auto"), simulated, (datapath, languages) -> img -> {
            throw new UnsatisfiedLinkError("libtesseract");
        });
        assertThat(noNative.isAvailable()).isFalse();
        assertThat(noNative.status().tessdataPresent()).isTrue();
        assertThat(noNative.extract(image, "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);

        AiAnalysisProperties fast = properties("auto");
        fast.getOcr().setTimeoutSeconds(1);
        Tess4jOcrService slow = new Tess4jOcrService(fast, simulated, (datapath, languages) -> img -> {
            if (img.getWidth() > 1) {
                Thread.sleep(5_000);
            }
            return List.of();
        });
        assertThat(slow.extract(image, "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);

        Tess4jOcrService failing = new Tess4jOcrService(properties("auto"), simulated, (datapath, languages) -> img -> {
            if (img.getWidth() > 1) {
                throw new IllegalStateException("boom");
            }
            return List.of();
        });
        assertThat(failing.extract(image, "promo-casino.png").engine()).isEqualTo(OcrEngine.SIMULE);
        assertThat(failing.extract(Files.writeString(tempDir.resolve("bad.png"), "nope"), "bad.png"))
                .isEqualTo(OcrService.OcrResult.none());
    }

    @Test
    void preparationScalesAndAssemblyFiltersByConfidence() {
        var small = Tess4jOcrService.prepare(new BufferedImage(500, 300, BufferedImage.TYPE_INT_ARGB));
        assertThat(small.scale()).isEqualTo(2.0);
        assertThat(small.image().getWidth()).isEqualTo(1000);
        assertThat(small.image().getType()).isEqualTo(BufferedImage.TYPE_BYTE_GRAY);
        assertThat(Tess4jOcrService.prepare(new BufferedImage(1500, 800, BufferedImage.TYPE_INT_RGB)).scale()).isEqualTo(1.0);
        var large = Tess4jOcrService.prepare(new BufferedImage(4000, 1000, BufferedImage.TYPE_INT_RGB));
        assertThat(large.image().getWidth()).isEqualTo(2000);
        assertThat(large.image().getHeight()).isEqualTo(500);

        var assembled = Tess4jOcrService.assemble(List.of(
                new Tess4jOcrService.RecognizedWord("  Promo ", 50f, 0, 0, 1000, 500),
                new Tess4jOcrService.RecognizedWord("bruit", 49.9f, 0, 0, 10, 10),
                new Tess4jOcrService.RecognizedWord(" ", 99f, 0, 0, 10, 10)), 0.5, 50, 4000, 1000);
        assertThat(assembled.text()).isEqualTo("Promo");
        // box mapped back and clamped to the original image
        assertThat(assembled.boxes()).containsExactly(new OcrBox(0, 0, 2000, 1000, 50f));
        assertThat(Tess4jOcrService.assemble(List.of(), 1, 50, 10, 10))
                .isEqualTo(new OcrService.OcrResult(null, OcrEngine.TESSERACT, List.of(), null));
    }

    @Test
    void resolverFollowsTheConfiguredMode() throws IOException {
        Tess4jOcrService unavailable = new Tess4jOcrService(properties("auto"), simulated, (d, l) -> img -> List.of());
        assertThat(new OcrServiceResolver(properties("auto"), unavailable, simulated).select()).isSameAs(simulated);
        assertThat(new OcrServiceResolver(properties("tess4j"), unavailable, simulated).select()).isSameAs(unavailable);
        assertThat(new OcrServiceResolver(properties("tesseract"), unavailable, simulated).select()).isSameAs(unavailable);

        writeTessdata("fra", "eng", "ara");
        Tess4jOcrService available = new Tess4jOcrService(properties("auto"), simulated, (d, l) -> img -> List.of());
        assertThat(new OcrServiceResolver(properties("auto"), available, simulated).select()).isSameAs(available);
        assertThat(new OcrServiceResolver(properties("simulated"), available, simulated).select()).isSameAs(simulated);
        assertThat(new OcrServiceResolver(properties("auto"), available, simulated).status().engine())
                .isEqualTo(OcrEngine.TESSERACT);
        assertThat(new OcrServiceResolver(properties("simulated"), available, simulated).status().engine())
                .isEqualTo(OcrEngine.SIMULE);
    }

    private void writeTessdata(String... languages) throws IOException {
        Path dir = tempDir.resolve("tessdata");
        Files.createDirectories(dir);
        for (String language : languages) {
            Files.writeString(dir.resolve(language + ".traineddata"), "fake");
        }
    }

    private Path writeImage(String name, int width, int height) throws IOException {
        Path file = tempDir.resolve(name);
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", file.toFile());
        return file;
    }

    private AiAnalysisProperties properties(String mode) {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getOcr().setMode(mode);
        properties.getOcr().setTessdataPath(tempDir.resolve("tessdata").toString());
        properties.getOcr().setLanguages("fra+eng+ara");
        return properties;
    }
}
