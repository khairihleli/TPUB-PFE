package com.example.tpubpfe.service.ai.media;

import com.example.tpubpfe.model.AiIssueSource;
import com.example.tpubpfe.model.AiMediaAnalysis;
import com.example.tpubpfe.service.ai.ocr.OcrBox;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ImageAnalyzerTest {

    @Test
    void aspectFitFollowsTheContractOrder() {
        assertThat(ImageAnalyzer.aspectFit(1920d / 1080)).isEqualTo("16:9");
        assertThat(ImageAnalyzer.aspectFit(1080d / 1920)).isEqualTo("9:16");
        assertThat(ImageAnalyzer.aspectFit(1.0)).isEqualTo("CARRE");
        assertThat(ImageAnalyzer.aspectFit(1.04)).isEqualTo("CARRE");
        // 16:10 = 1.6 → 10 % from 16:9
        assertThat(ImageAnalyzer.aspectFit(1.6)).isEqualTo("PROCHE");
        assertThat(ImageAnalyzer.aspectFit(4d / 3)).isEqualTo("AUTRE");
        assertThat(ImageAnalyzer.aspectFit(3.5)).isEqualTo("AUTRE");
    }

    @Test
    void dimensionFindingsCoverResolutionAndFormat() {
        assertThat(ImageAnalyzer.dimensionFindings(1920, 1080, AiIssueSource.IMAGE)).isEmpty();
        assertThat(ImageAnalyzer.dimensionFindings(1080, 1920, AiIssueSource.IMAGE)).isEmpty();
        assertThat(labels(ImageAnalyzer.dimensionFindings(640, 360, AiIssueSource.IMAGE)))
                .containsExactly(ImageAnalyzer.LOW_RESOLUTION);
        assertThat(labels(ImageAnalyzer.dimensionFindings(1024, 576, AiIssueSource.IMAGE)))
                .containsExactly(ImageAnalyzer.MEDIUM_RESOLUTION);
        assertThat(ImageAnalyzer.dimensionFindings(1000, 1000, AiIssueSource.VIDEO))
                .extracting(MediaFinding::label, MediaFinding::qualityDelta, MediaFinding::source)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(ImageAnalyzer.MEDIUM_RESOLUTION, -5, AiIssueSource.VIDEO),
                        org.assertj.core.groups.Tuple.tuple(ImageAnalyzer.SQUARE_FORMAT, -3, AiIssueSource.VIDEO));
        assertThat(ImageAnalyzer.dimensionFindings(1920, 1200, AiIssueSource.IMAGE))
                .extracting(MediaFinding::qualityDelta).containsExactly(-2);
        assertThat(ImageAnalyzer.dimensionFindings(1600, 1200, AiIssueSource.IMAGE))
                .extracting(MediaFinding::qualityDelta).containsExactly(-5);
    }

    @Test
    void sharpDetailedImageHasHighSharpnessAndSeveralColours() {
        BufferedImage image = new BufferedImage(512, 288, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 288; y++) {
            for (int x = 0; x < 512; x++) {
                int rgb = ((x / 32 + y / 32) % 2 == 0) ? 0xE11D2A : 0x0A5CA8;
                if ((x + y) % 7 == 0) {
                    rgb = 0xFFFFFF;
                }
                image.setRGB(x, y, rgb);
            }
        }
        AiMediaAnalysis.ImageMetrics metrics = ImageAnalyzer.analyze(image, List.of(), 512);

        assertThat(metrics.getWidth()).isEqualTo(512);
        assertThat(metrics.getAspectFit()).isEqualTo("16:9");
        assertThat(metrics.getSharpness()).isGreaterThan(100);
        assertThat(metrics.getContrast()).isGreaterThan(30);
        assertThat(metrics.getDominantColors()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(metrics.getDominantColors().get(0).getHex()).matches("#[0-9a-f]{6}");
        double shares = metrics.getDominantColors().stream().mapToDouble(AiMediaAnalysis.DominantColor::getShare).sum();
        assertThat(shares).isBetween(0.9, 1.001);
        assertThat(ImageAnalyzer.metricFindings(metrics, AiIssueSource.IMAGE)).isEmpty();
    }

    @Test
    void flatBrightImageIsFlaggedAndDeterministic() {
        BufferedImage image = new BufferedImage(800, 450, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(new Color(240, 240, 240));
        g.fillRect(0, 0, 800, 450);
        g.dispose();

        AiMediaAnalysis.ImageMetrics first = ImageAnalyzer.analyze(image, List.of(new OcrBox(0, 0, 400, 150, 80f)), 512);
        AiMediaAnalysis.ImageMetrics second = ImageAnalyzer.analyze(image, List.of(new OcrBox(0, 0, 400, 150, 80f)), 512);
        assertThat(first).isEqualTo(second);
        assertThat(first.getBrightness()).isEqualTo(240.0);
        assertThat(first.getContrast()).isZero();
        assertThat(first.getSharpness()).isZero();
        assertThat(first.getTextCoverage()).isEqualTo(0.167);
        assertThat(first.getDominantColors()).singleElement().satisfies(c -> {
            assertThat(c.getHex()).isEqualTo("#f0f0f0");
            assertThat(c.getShare()).isEqualTo(1.0);
        });
        assertThat(labels(ImageAnalyzer.metricFindings(first, AiIssueSource.IMAGE))).containsExactly(
                ImageAnalyzer.BLURRY, ImageAnalyzer.OVEREXPOSED, ImageAnalyzer.LOW_CONTRAST, ImageAnalyzer.UNIFORM);
    }

    @Test
    void textCoverageThresholdsAndWorstFrame() {
        AiMediaAnalysis.ImageMetrics base = AiMediaAnalysis.ImageMetrics.builder().width(1920).height(1080)
                .aspectRatio(1.778).aspectFit("16:9").sharpness(300).brightness(120).contrast(60).textCoverage(0.40)
                .dominantColors(List.of(new AiMediaAnalysis.DominantColor("#101010", 0.5))).build();
        assertThat(ImageAnalyzer.metricFindings(base, AiIssueSource.IMAGE))
                .extracting(MediaFinding::label, MediaFinding::qualityDelta, MediaFinding::riskPoints)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(ImageAnalyzer.TOO_MUCH_TEXT, -10, 0));
        base.setTextCoverage(0.6);
        assertThat(ImageAnalyzer.metricFindings(base, AiIssueSource.IMAGE)).singleElement().satisfies(f -> {
            assertThat(f.qualityDelta()).isEqualTo(-15);
            assertThat(f.riskPoints()).isEqualTo(5);
            assertThat(f.riskLabel()).isEqualTo(ImageAnalyzer.TEXT_OVERLOAD_RISK);
        });
        base.setSharpness(70);
        assertThat(labels(ImageAnalyzer.metricFindings(base, AiIssueSource.IMAGE))).contains(ImageAnalyzer.LIMITED_SHARPNESS);

        AiMediaAnalysis.ImageMetrics a = AiMediaAnalysis.ImageMetrics.builder().width(1920).height(1080).aspectFit("16:9")
                .sharpness(200).brightness(140).contrast(40).textCoverage(0.1).build();
        AiMediaAnalysis.ImageMetrics b = AiMediaAnalysis.ImageMetrics.builder().width(1920).height(1080).aspectFit("16:9")
                .sharpness(80).brightness(30).contrast(55).textCoverage(0.05).build();
        AiMediaAnalysis.ImageMetrics c = AiMediaAnalysis.ImageMetrics.builder().width(1920).height(1080).aspectFit("16:9")
                .sharpness(150).brightness(200).contrast(20).textCoverage(0.3).build();
        AiMediaAnalysis.ImageMetrics worst = ImageAnalyzer.worst(List.of(a, b, c));
        assertThat(worst.getSharpness()).isEqualTo(80);
        assertThat(worst.getContrast()).isEqualTo(20);
        assertThat(worst.getBrightness()).isEqualTo(30);
        assertThat(worst.getTextCoverage()).isEqualTo(0.3);
        assertThat(ImageAnalyzer.worst(List.of())).isNull();
    }

    private static List<String> labels(List<MediaFinding> findings) {
        return findings.stream().map(MediaFinding::label).toList();
    }
}
