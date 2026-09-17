package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentType;
import com.example.tpubpfe.model.AiEngine;
import com.example.tpubpfe.model.AiIssue;
import com.example.tpubpfe.model.AiIssueSource;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiRuleType;
import com.example.tpubpfe.model.AiSector;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.model.AiProviderType;
import com.example.tpubpfe.model.OcrEngine;
import com.example.tpubpfe.service.ai.learning.CalibrationSnapshot;
import com.example.tpubpfe.service.ai.media.ImageAnalyzer;
import com.example.tpubpfe.service.ai.ocr.OcrBox;
import com.example.tpubpfe.service.ai.provider.VisionModerationProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ContentAnalysisPipelineTest {

    private static final String GOOD_OBJECTIVE =
            "Découvrez notre nouvelle collection automne dans nos boutiques de Tunis, du lundi au samedi.";

    private final ContentAnalysisPipeline pipeline = new ContentAnalysisPipeline(new SimulatedOcrService());

    private static MediaInput goodImage(long id, String fileName) {
        return new MediaInput(id, fileName, MediaFileType.IMAGE, "image/jpeg", 350_000L, null, 1920, 1080,
                "sha-" + id, null);
    }

    private static AiModerationRule keyword(long id, String name, String pattern, AiModerationSeverity severity) {
        return AiModerationRule.builder().id(id).ruleName(name).ruleType(AiRuleType.KEYWORD).pattern(pattern)
                .severity(severity).isActive(true).build();
    }

    private static ContentAnalysisPipeline.AnalysisInput input(String name, String objective, String budget,
                                                               List<MediaInput> media, List<AiModerationRule> rules) {
        return new ContentAnalysisPipeline.AnalysisInput(name, objective, new BigDecimal(budget), media, rules, List.of());
    }

    @Test
    void cleanContentIsApprovedWithBaseScores() {
        var outcome = pipeline.analyze(input("Collection automne", GOOD_OBJECTIVE, "500",
                List.of(goodImage(1, "visuel.jpg")), List.of()));

        assertThat(outcome.status()).isEqualTo(AiCheckStatus.APPROVED);
        assertThat(outcome.riskScore()).isEqualTo(10);
        assertThat(outcome.qualityScore()).isEqualTo(85);
        assertThat(outcome.issues()).isEmpty();
        assertThat(outcome.recommendation()).isEqualTo(ContentAnalysisPipeline.SUMMARY_APPROVED);
        assertThat(outcome.contentType()).isEqualTo(AiContentType.IMAGE);
        assertThat(outcome.primaryMediaId()).isEqualTo(1L);
        assertThat(outcome.engine()).isEqualTo(AiEngine.LOCAL);
        assertThat(outcome.sector()).isEqualTo(AiSector.COMMERCE);
        // "visuel" has >= 3 letters: simulated OCR text
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.SIMULE);
    }

    @Test
    void keywordRulesMatchWholeWordsAccentInsensitive() {
        var rules = List.of(keyword(1, "promesse", "gratuit, 100% garanti", AiModerationSeverity.MEDIUM));

        var hit = pipeline.analyze(input("Offre", "Livraison GRATUITÉ ? Non : livraison gratuit et 100% GARANTI pour tous.",
                "500", List.of(goodImage(1, "a.jpg")), rules));
        assertThat(hit.matchedRules()).hasSize(1);
        assertThat(hit.riskScore()).isEqualTo(10 + 25);
        assertThat(hit.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(hit.issues()).anySatisfy(issue -> {
            assertThat(issue.getSource()).isEqualTo(AiIssueSource.REGLE);
            assertThat(issue.getLabel()).contains("gratuit").contains("100% garanti");
        });

        var noHit = pipeline.analyze(input("Offre", "Des gratuites ? Non, des gratuités pour nos clients fidèles.", "500",
                List.of(goodImage(1, "a.jpg")), rules));
        assertThat(noHit.matchedRules()).isEmpty();
    }

    @Test
    void highRuleForcesReviewAndCriticalRuleRejects() {
        var high = pipeline.analyze(input("Soirée", GOOD_OBJECTIVE + " Casino ouvert.", "500",
                List.of(goodImage(1, "a.jpg")), List.of(keyword(1, "jeux", "casino", AiModerationSeverity.HIGH))));
        assertThat(high.riskScore()).isEqualTo(55);
        assertThat(high.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);

        var critical = pipeline.analyze(input("Vente", GOOD_OBJECTIVE + " Munitions disponibles.", "500",
                List.of(goodImage(1, "a.jpg")), List.of(keyword(2, "armes", "munitions", AiModerationSeverity.CRITICAL))));
        assertThat(critical.status()).isEqualTo(AiCheckStatus.REJECTED);
        assertThat(critical.recommendation()).isEqualTo(ContentAnalysisPipeline.SUMMARY_REJECTED);
    }

    @Test
    void lowRuleAloneStaysApproved() {
        var low = pipeline.analyze(input("Collection", GOOD_OBJECTIVE + " Offre limitée !!", "500",
                List.of(goodImage(1, "a.jpg")),
                List.of(AiModerationRule.builder().id(3L).ruleName("urgence").ruleType(AiRuleType.REGEX)
                        .pattern("(derniere chance|offre limitee).{0,20}!{2,}").severity(AiModerationSeverity.LOW)
                        .isActive(true).build())));
        assertThat(low.matchedRules()).singleElement().satisfies(rule -> assertThat(rule.getRuleName()).isEqualTo("urgence"));
        assertThat(low.riskScore()).isEqualTo(20);
        assertThat(low.status()).isEqualTo(AiCheckStatus.APPROVED);
    }

    @Test
    void inactiveOrInvalidRulesAreIgnored() {
        var rules = List.of(
                AiModerationRule.builder().id(1L).ruleName("off").ruleType(AiRuleType.KEYWORD).pattern("collection")
                        .severity(AiModerationSeverity.CRITICAL).isActive(false).build(),
                AiModerationRule.builder().id(2L).ruleName("broken").ruleType(AiRuleType.REGEX).pattern("([a-")
                        .severity(AiModerationSeverity.CRITICAL).isActive(true).build());
        var outcome = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(goodImage(1, "a.jpg")), rules));
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.APPROVED);
        assertThat(outcome.matchedRules()).isEmpty();
    }

    @Test
    void ocrTextIsCheckedAgainstRulesAndLabelled() {
        var outcome = pipeline.analyze(input("Soirée", GOOD_OBJECTIVE, "500",
                List.of(goodImage(7, "IMG_2024-promo-casino-jackpot.png")),
                List.of(keyword(1, "jeux-argent", "casino, jackpot", AiModerationSeverity.HIGH))));

        assertThat(outcome.extractedText()).isEqualTo("promo casino jackpot");
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.SIMULE);
        assertThat(outcome.mediaAnalyses()).singleElement()
                .satisfies(media -> assertThat(media.getExtractedText()).isEqualTo("promo casino jackpot"));
        assertThat(outcome.issues()).anySatisfy(issue -> {
            assertThat(issue.getSource()).isEqualTo(AiIssueSource.OCR);
            assertThat(issue.getLabel()).startsWith("texte dans l'image : ");
        });
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
    }

    @Test
    void gibberishTextIsFlaggedForManualReview() {
        var outcome = pipeline.analyze(input("x", "aaa", "500", List.of(goodImage(1, "img.jpg")), List.of()));

        // risk: 10 + incohérent 25 = 35 → manual review
        assertThat(outcome.riskScore()).isEqualTo(35);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(outcome.issueLabels()).contains(ContentAnalysisPipeline.INCOHERENT_TEXT, "texte trop court");

        assertThat(TextNormalizer.looksIncoherent("qsdf ghjk lmpq azerty")).isTrue();
        assertThat(TextNormalizer.looksIncoherent("Promo géniale : soldeeeeeees")).isTrue();
        assertThat(TextNormalizer.looksIncoherent("Collection automne\n" + GOOD_OBJECTIVE)).isFalse();
        assertThat(TextNormalizer.looksIncoherent("PROMO SUPER GENIALE!!!")).isFalse();
        assertThat(TextNormalizer.looksIncoherent("تخفيضات كبيرة في متجرنا بتونس")).isFalse();
        assertThat(TextNormalizer.looksIncoherent("CrossFit Gym 24h/7")).isFalse();
    }

    @Test
    void textHeuristicsAndMissingContentLowerQuality() {
        var outcome = pipeline.analyze(input("PROMO SUPER GENIALE!!!", null, "0", List.of(), List.of()));

        // risk: 10 + majuscules 10 + ponctuation 5 + budget 25 = 50
        assertThat(outcome.riskScore()).isEqualTo(50);
        // quality: 85 - majuscules 10 - objectif 25 - court 15 - aucun visuel 15 = 20
        assertThat(outcome.qualityScore()).isEqualTo(20);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(outcome.issueLabels()).contains("texte en majuscules", "ponctuation excessive", "budget insuffisant",
                "objectif absent", "texte trop court", "aucun visuel fourni");
        assertThat(outcome.recommendations()).hasSize(4);
        assertThat(outcome.contentType()).isEqualTo(AiContentType.TEXTE);
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.AUCUN);
    }

    @Test
    void mediaMetadataHeuristicsAreCountedOncePerLabel() {
        MediaInput small = new MediaInput(1L, "a.jpg", MediaFileType.IMAGE, "image/jpeg", 10_000L, null, 640, 640, null, null);
        MediaInput smallToo = new MediaInput(2L, "b.jpg", MediaFileType.BANNER, "image/jpeg", 300_000L, null, 700, 200, null, null);
        MediaInput longVideo = new MediaInput(3L, "c.mp4", MediaFileType.VIDEO, "video/mp4", 5_000_000L, 90, null, null, null, null);

        var outcome = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(small, smallToo, longVideo), List.of()));

        // 85 - résolution 15 - carré 3 - format inadapté 5 - léger 10 - vidéo longue 10 = 42
        assertThat(outcome.qualityScore()).isEqualTo(42);
        assertThat(outcome.issueLabels()).contains(ImageAnalyzer.SQUARE_FORMAT, ImageAnalyzer.BAD_FORMAT);
        assertThat(outcome.contentType()).isEqualTo(AiContentType.VIDEO);
        assertThat(outcome.recommendations()).contains("Fournissez un visuel d'au moins 1280×720 px");
        assertThat(outcome.mediaAnalyses()).hasSize(3);
        assertThat(outcome.mediaAnalyses().get(2).getContentType()).isEqualTo(AiContentType.VIDEO);
        assertThat(outcome.mediaAnalyses().get(2).getIssues()).containsExactly(MediaMetadataAnalyzer.VIDEO_TOO_LONG);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.APPROVED);
    }

    @Test
    void qualityBelow40RequiresReview() {
        MediaInput video = new MediaInput(3L, "c.mp4", MediaFileType.VIDEO, "video/mp4", 5_000_000L, null, null, null, null, null);
        var outcome = pipeline.analyze(input("Promo", "", "100", List.of(video), List.of()));
        // 85 - durée inconnue 5 - objectif 25 - court 15 = 40 -> still >= 40
        assertThat(outcome.qualityScore()).isEqualTo(40);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.APPROVED);

        var worse = pipeline.analyze(input("Promo", "", "100", List.of(), List.of()));
        // 85 - objectif 25 - court 15 - aucun visuel 15 = 30
        assertThat(worse.qualityScore()).isEqualTo(30);
        assertThat(worse.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
    }

    @Test
    void duplicateMediaAndHealthSectorAddRisk() {
        var outcome = pipeline.analyze(new ContentAnalysisPipeline.AnalysisInput("Clinique dentaire",
                "Soins dentaires et traitement orthodontique dans notre clinique de Sousse, sur rendez-vous.",
                new BigDecimal("300"), List.of(goodImage(1, "cabinet.jpg")), List.of(),
                List.of(new ContentAnalysisPipeline.DuplicateHit(1L, 42L), new ContentAnalysisPipeline.DuplicateHit(1L, 42L))));

        assertThat(outcome.sector()).isEqualTo(AiSector.SANTE);
        // 10 + doublon 15 + secteur santé 10
        assertThat(outcome.riskScore()).isEqualTo(35);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(outcome.issues()).extracting(AiIssue::getSource)
                .containsExactlyInAnyOrder(AiIssueSource.DOUBLON, AiIssueSource.SECTEUR);
        assertThat(outcome.issueLabels()).contains("média identique à celui de la campagne #42");
    }

    @Test
    void tooMuchTextInVisualLowersQuality() {
        OcrService verbose = (Path file, String name) -> new OcrService.OcrResult("x".repeat(250), OcrEngine.TESSERACT);
        var outcome = new ContentAnalysisPipeline(verbose).analyze(input("Collection", GOOD_OBJECTIVE, "500",
                List.of(goodImage(1, "a.jpg")), List.of()));
        assertThat(outcome.qualityScore()).isEqualTo(75);
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.TESSERACT);
        assertThat(outcome.issueLabels()).contains("trop de texte dans le visuel");
    }

    @Test
    void ocrFailureDoesNotBreakTheAnalysis() {
        OcrService failing = (file, name) -> {
            throw new IllegalStateException("boom");
        };
        var outcome = new ContentAnalysisPipeline(failing).analyze(input("Collection", GOOD_OBJECTIVE, "500",
                List.of(goodImage(1, "casino.jpg")), List.of()));
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.AUCUN);
        assertThat(outcome.status()).isEqualTo(AiCheckStatus.APPROVED);
    }

    @Test
    void providerMergeKeepsTheMostSevereOpinion() {
        var local = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(goodImage(1, "a.jpg")), List.of()));
        var verdict = new VisionModerationProvider.ProviderVerdict(AiCheckStatus.REVIEW_REQUIRED, 45, 90,
                List.of("promesse ambiguë"), "Précisez les conditions de l'offre", "doute", "gpt-4o-mini");
        var merged = pipeline.mergeProvider(local, verdict, AiProviderType.OPENAI);

        assertThat(merged.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(merged.riskScore()).isEqualTo(45);
        assertThat(merged.qualityScore()).isEqualTo(85);
        assertThat(merged.engine()).isEqualTo(AiEngine.LOCAL_OPENAI);
        assertThat(merged.providerModel()).isEqualTo("gpt-4o-mini");
        assertThat(merged.issues()).anySatisfy(issue -> assertThat(issue.getSource()).isEqualTo(AiIssueSource.OPENAI));
        assertThat(merged.recommendations()).contains("Précisez les conditions de l'offre");
        assertThat(merged.recommendation()).isEqualTo(ContentAnalysisPipeline.SUMMARY_REVIEW);

        var claude = pipeline.mergeProvider(local, new VisionModerationProvider.ProviderVerdict(AiCheckStatus.REJECTED, 20,
                30, List.of("symbole choquant"), null, null, "claude-opus-5"), AiProviderType.ANTHROPIC);
        assertThat(claude.status()).isEqualTo(AiCheckStatus.REJECTED);
        assertThat(claude.riskScore()).isEqualTo(20);
        assertThat(claude.qualityScore()).isEqualTo(30);
        assertThat(claude.engine()).isEqualTo(AiEngine.LOCAL_ANTHROPIC);
        assertThat(claude.reason()).startsWith("Analyse locale + Anthropic");
        assertThat(claude.issues()).anySatisfy(issue -> assertThat(issue.getSource()).isEqualTo(AiIssueSource.ANTHROPIC));

        var fallback = pipeline.withFallbackReason(local, "Anthropic indisponible : analyse locale appliquée");
        assertThat(fallback.engine()).isEqualTo(AiEngine.LOCAL);
        assertThat(fallback.providerModel()).isNull();
        assertThat(fallback.reason()).endsWith("(Anthropic indisponible : analyse locale appliquée)");
    }

    @Test
    void calibrationWeightsRulePointsAndMovesThresholds() {
        var rules = List.of(keyword(1, "jeux", "casino", AiModerationSeverity.MEDIUM));
        var media = List.of(goodImage(1, "a.jpg"));

        var neutral = pipeline.analyze(input("Soirée", GOOD_OBJECTIVE + " Casino ouvert.", "500", media, rules));
        assertThat(neutral.riskScore()).isEqualTo(35);
        assertThat(neutral.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);

        var lowered = new CalibrationSnapshot(4, 31, 70, Map.of(1L, 0.5));
        var weighted = pipeline.analyze(new ContentAnalysisPipeline.AnalysisInput("Soirée", GOOD_OBJECTIVE + " Casino ouvert.",
                new BigDecimal("500"), media, rules, List.of(), 9L, lowered));
        // round(25 × 0.5) = 13 → 23 < 31
        assertThat(weighted.riskScore()).isEqualTo(23);
        assertThat(weighted.status()).isEqualTo(AiCheckStatus.APPROVED);

        var strict = new CalibrationSnapshot(5, 21, 60, Map.of());
        var reviewed = pipeline.analyze(new ContentAnalysisPipeline.AnalysisInput("Collection automne", GOOD_OBJECTIVE,
                new BigDecimal("500"), media, List.of(keyword(2, "urgence", "tunis", AiModerationSeverity.LOW)), List.of(),
                9L, strict));
        assertThat(reviewed.riskScore()).isEqualTo(20);
        assertThat(reviewed.status()).isEqualTo(AiCheckStatus.APPROVED);
        assertThat(ContentAnalysisPipeline.status(false, false, 21, 80, strict)).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(ContentAnalysisPipeline.status(false, false, 61, 80, strict)).isEqualTo(AiCheckStatus.REJECTED);
        assertThat(ContentAnalysisPipeline.status(true, false, 0, 80, strict)).isEqualTo(AiCheckStatus.REJECTED);
        assertThat(ContentAnalysisPipeline.status(false, true, 0, 80, strict)).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
    }

    @Test
    void decodedImageIsMeasuredAndPixelIssuesAreReported(@TempDir Path dir) throws IOException {
        BufferedImage flat = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = flat.createGraphics();
        g.setColor(new Color(20, 20, 20));
        g.fillRect(0, 0, 1920, 1080);
        g.dispose();
        Path file = dir.resolve("flat.png");
        ImageIO.write(flat, "png", file.toFile());
        MediaInput media = new MediaInput(4L, "visuel-sombre.png", MediaFileType.IMAGE, "image/png", 300_000L, null,
                null, null, null, file);

        var outcome = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(media), List.of()));

        var analysis = outcome.mediaAnalyses().get(0);
        assertThat(analysis.getWidthPx()).isEqualTo(1920);
        assertThat(analysis.getMetrics()).isNotNull();
        assertThat(analysis.getMetrics().getAspectFit()).isEqualTo("16:9");
        assertThat(analysis.getMetrics().getSharpness()).isZero();
        assertThat(analysis.getOcrEngine()).isEqualTo(OcrEngine.SIMULE);
        assertThat(analysis.getIssues()).contains(ImageAnalyzer.BLURRY, ImageAnalyzer.TOO_DARK, ImageAnalyzer.LOW_CONTRAST,
                ImageAnalyzer.UNIFORM);
        // 85 - flou 15 - sombre 10 - contraste 10 - uniforme 10 = 40
        assertThat(outcome.qualityScore()).isEqualTo(40);
        assertThat(outcome.recommendations()).contains("Fournissez un visuel net (évitez les agrandissements)");

        Path broken = Files.writeString(dir.resolve("broken.jpg"), "not an image");
        var failed = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(new MediaInput(5L, "broken.jpg",
                MediaFileType.IMAGE, "image/jpeg", 300_000L, null, 1920, 1080, null, broken)), List.of()));
        assertThat(failed.issueLabels()).contains(ImageAnalyzer.DECODE_FAILED);
        assertThat(failed.qualityScore()).isEqualTo(85);
        assertThat(failed.mediaAnalyses().get(0).getMetrics()).isNull();
    }

    @Test
    void textCoverageAboveHalfAddsRiskOnce(@TempDir Path dir) throws IOException {
        BufferedImage busy = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 1080; y++) {
            for (int x = 0; x < 1920; x++) {
                busy.setRGB(x, y, ((x / 3 + y / 5) % 2 == 0) ? 0xFFFFFF : ((x * 7 + y * 13) & 0xFF) << 8);
            }
        }
        Path a = dir.resolve("a.png");
        Path b = dir.resolve("b.png");
        ImageIO.write(busy, "png", a.toFile());
        ImageIO.write(busy, "png", b.toFile());
        OcrService boxes = new OcrService() {
            @Override
            public OcrResult extract(Path file, String name) {
                return OcrResult.none();
            }

            @Override
            public OcrResult extractImage(BufferedImage image, Path file, String name) {
                return new OcrResult("SOLDES", OcrEngine.TESSERACT, List.of(new OcrBox(0, 0, 1920, 600, 90f)), 90d);
            }
        };
        var outcome = new ContentAnalysisPipeline(boxes).analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(
                new MediaInput(1L, "a.png", MediaFileType.IMAGE, "image/png", 900_000L, null, null, null, null, a),
                new MediaInput(2L, "b.png", MediaFileType.BANNER, "image/png", 900_000L, null, null, null, null, b)), List.of()));

        assertThat(outcome.mediaAnalyses().get(0).getMetrics().getTextCoverage()).isEqualTo(0.556);
        assertThat(outcome.mediaAnalyses().get(0).getOcrConfidence()).isEqualTo(90d);
        assertThat(outcome.issueLabels()).contains(ImageAnalyzer.TOO_MUCH_TEXT, ImageAnalyzer.TEXT_OVERLOAD_RISK);
        assertThat(outcome.riskScore()).isEqualTo(15);
        assertThat(outcome.extractedText()).isEqualTo("SOLDES");
        assertThat(outcome.ocrEngine()).isEqualTo(OcrEngine.TESSERACT);
    }

    @Test
    void webmVideoIsReportedAsUnsupported() {
        MediaInput webm = new MediaInput(8L, "clip.webm", MediaFileType.VIDEO, "video/webm", 3_000_000L, 20, null, null,
                null, Path.of("clip.webm"));
        var outcome = pipeline.analyze(input("Collection", GOOD_OBJECTIVE, "500", List.of(webm), List.of()));
        assertThat(outcome.issueLabels()).contains(ContentAnalysisPipeline.WEBM_UNSUPPORTED);
        assertThat(outcome.mediaAnalyses().get(0).getVideoSupported()).isFalse();
        assertThat(outcome.qualityScore()).isEqualTo(85);
    }
}
