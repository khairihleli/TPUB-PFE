package com.example.zelqanepfe.service.ai.ocr;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.OcrEngine;
import com.example.zelqanepfe.service.ai.OcrService;
import com.example.zelqanepfe.service.ai.SimulatedOcrService;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Real Tesseract recognition, only when {@code BackEnd/tessdata} was fetched (scripts/fetch-tessdata) and the native
 * library loads on this machine; skipped otherwise.
 */
class Tess4jRealOcrTest {

    @Test
    void recognisesRenderedFrenchText() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getOcr().setTessdataPath(Path.of("tessdata").toAbsolutePath().toString());
        properties.getOcr().setLanguages("fra+eng+ara");
        Tess4jOcrService service = new Tess4jOcrService(properties, new SimulatedOcrService());
        assumeTrue(service.tessdataPresent(), "tessdata absent");
        assumeTrue(service.isAvailable(), "Tesseract natif indisponible");

        BufferedImage image = new BufferedImage(1280, 720, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 1280, 720);
        g.setColor(Color.BLACK);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 96));
        g.drawString("GRANDES SOLDES", 120, 300);
        g.drawString("MAGASIN OUVERT", 120, 480);
        g.dispose();

        OcrService.OcrResult result = service.extractImage(image, null, "image.png");

        assertThat(result.engine()).isEqualTo(OcrEngine.TESSERACT);
        assertThat(result.text()).containsIgnoringCase("SOLDES");
        assertThat(result.boxes()).isNotEmpty();
        assertThat(result.meanConfidence()).isGreaterThan(50);
    }
}
