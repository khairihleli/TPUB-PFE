package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.OcrEngine;
import com.example.tpubpfe.service.ai.ocr.OcrBox;

import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.List;

/**
 * Text-in-image extraction. Implementations never throw: a failure yields an empty result.
 */
public interface OcrService {

    /**
     * @param file             absolute path of the stored image, may be null or missing on disk
     * @param originalFileName the file name given by the advertiser
     */
    OcrResult extract(Path file, String originalFileName);

    /**
     * OCR on an already decoded image (a still image or a video frame). Engines without pixel access fall back to
     * {@link #extract(Path, String)}.
     */
    default OcrResult extractImage(BufferedImage image, Path file, String originalFileName) {
        return extract(file, originalFileName);
    }

    record OcrResult(String text, OcrEngine engine, List<OcrBox> boxes, Double meanConfidence) {

        public OcrResult {
            boxes = boxes == null ? List.of() : List.copyOf(boxes);
        }

        public OcrResult(String text, OcrEngine engine) {
            this(text, engine, List.of(), null);
        }

        public static OcrResult none() {
            return new OcrResult(null, OcrEngine.AUCUN);
        }

        public boolean hasText() {
            return text != null && !text.isBlank();
        }
    }
}
