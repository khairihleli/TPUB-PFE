package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.OcrEngine;
import com.example.zelqanepfe.service.ai.ocr.Tess4jOcrService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Picks the OCR engine from {@code zelqane.analysis.ocr.mode} (docs/round2-contract.md §2.2): {@code tess4j}
 * (legacy {@code tesseract}), {@code simulated}, or {@code auto} (Tess4J when its probe succeeds, else simulated).
 */
@Primary
@Component
@RequiredArgsConstructor
public class OcrServiceResolver implements OcrService {

    /** Effective OCR engine, for {@code GET /api/ai/providers}. */
    public record OcrStatus(OcrEngine engine, String languages, boolean tessdataPresent, String reason) {
    }

    private final AiAnalysisProperties properties;
    private final Tess4jOcrService tess4j;
    private final SimulatedOcrService simulated;

    @Override
    public OcrResult extract(Path file, String originalFileName) {
        return select().extract(file, originalFileName);
    }

    @Override
    public OcrResult extractImage(BufferedImage image, Path file, String originalFileName) {
        return select().extractImage(image, file, originalFileName);
    }

    OcrService select() {
        return switch (mode()) {
            case "tess4j", "tesseract" -> tess4j;
            case "simulated", "simule" -> simulated;
            default -> tess4j.isAvailable() ? tess4j : simulated;
        };
    }

    public OcrStatus status() {
        if ("simulated".equals(mode()) || "simule".equals(mode())) {
            return new OcrStatus(OcrEngine.SIMULE, tess4j.languages(), tess4j.tessdataPresent(),
                    "OCR simulé imposé par la configuration (zelqane.analysis.ocr.mode)");
        }
        Tess4jOcrService.Status status = tess4j.status();
        return new OcrStatus(status.available() ? OcrEngine.TESSERACT : OcrEngine.SIMULE, tess4j.languages(),
                status.tessdataPresent(), status.reason());
    }

    private String mode() {
        String mode = properties.getOcr().getMode();
        return mode == null ? "auto" : mode.trim().toLowerCase(Locale.ROOT);
    }
}
