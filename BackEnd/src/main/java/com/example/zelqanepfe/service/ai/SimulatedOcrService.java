package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.model.OcrEngine;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Simulated OCR: derives the "text in the image" from the original file name
 * (e.g. {@code promo-casino_jackpot.png} → {@code promo casino jackpot}). No native dependency.
 */
@Component
public class SimulatedOcrService implements OcrService {

    private static final Pattern SEPARATORS = Pattern.compile("[-_. ]+");
    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final Pattern NOISE = Pattern.compile("(?i)img|dsc|image|photo|screenshot|whatsapp");

    @Override
    public OcrResult extract(Path file, String originalFileName) {
        if (originalFileName == null || originalFileName.isBlank()) {
            return OcrResult.none();
        }
        String name = originalFileName.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        String text = Arrays.stream(SEPARATORS.split(name))
                .map(String::trim)
                .filter(token -> !token.isEmpty())
                .filter(token -> !DIGITS.matcher(token).matches())
                .filter(token -> !NOISE.matcher(token).matches())
                .collect(Collectors.joining(" "));
        if (TextNormalizer.letterCount(text) < 3) {
            return OcrResult.none();
        }
        return new OcrResult(text, OcrEngine.SIMULE);
    }
}
