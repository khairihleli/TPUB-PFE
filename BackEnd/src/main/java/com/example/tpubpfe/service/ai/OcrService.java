package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.OcrEngine;

import java.nio.file.Path;

/**
 * Text-in-image extraction. Implementations never throw: a failure yields an empty result.
 */
public interface OcrService {

    /**
     * @param file             absolute path of the stored image, may be null or missing on disk
     * @param originalFileName the file name given by the advertiser
     */
    OcrResult extract(Path file, String originalFileName);

    record OcrResult(String text, OcrEngine engine) {

        public static OcrResult none() {
            return new OcrResult(null, OcrEngine.AUCUN);
        }

        public boolean hasText() {
            return text != null && !text.isBlank();
        }
    }
}
