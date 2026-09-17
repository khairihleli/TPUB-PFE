package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.config.TpubProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Locale;

/**
 * Picks the OCR engine from {@code tpub.ai.ocr.mode}: {@code tesseract}, {@code simulated}, or {@code auto}
 * (Tesseract when {@code tesseract --version} succeeds, else simulated).
 */
@Primary
@Component
@RequiredArgsConstructor
public class OcrServiceResolver implements OcrService {

    private final TpubProperties properties;
    private final TesseractOcrService tesseract;
    private final SimulatedOcrService simulated;

    @Override
    public OcrResult extract(Path file, String originalFileName) {
        return select().extract(file, originalFileName);
    }

    OcrService select() {
        String mode = properties.getAi().getOcr().getMode();
        mode = mode == null ? "auto" : mode.trim().toLowerCase(Locale.ROOT);
        return switch (mode) {
            case "tesseract" -> tesseract;
            case "simulated", "simule" -> simulated;
            default -> tesseract.isAvailable() ? tesseract : simulated;
        };
    }
}
