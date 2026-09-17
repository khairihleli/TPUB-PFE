package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.config.AiAnalysisProperties;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentType;
import com.example.tpubpfe.model.AiEngine;
import com.example.tpubpfe.model.AiIssue;
import com.example.tpubpfe.model.AiIssueSource;
import com.example.tpubpfe.model.AiMatchedRule;
import com.example.tpubpfe.model.AiMediaAnalysis;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiProviderType;
import com.example.tpubpfe.model.AiSector;
import com.example.tpubpfe.model.OcrEngine;
import com.example.tpubpfe.service.ai.learning.CalibrationSnapshot;
import com.example.tpubpfe.service.ai.media.ImageAnalyzer;
import com.example.tpubpfe.service.ai.media.MediaFinding;
import com.example.tpubpfe.service.ai.media.ThumbnailStore;
import com.example.tpubpfe.service.ai.media.VideoFrameExtractor;
import com.example.tpubpfe.service.ai.provider.VisionModerationProvider.ProviderVerdict;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Local content analysis (completion contract §2.2, docs/round2-contract.md §2.2–2.6): rules weighted by the active
 * calibration, text heuristics, OCR, image metrics, video frames, sector, status and recommendations. Deterministic
 * for a given input; persistence is handled by {@code AiVerificationService}.
 */
@Component
public class ContentAnalysisPipeline {

    public static final String SUMMARY_APPROVED = "Contenu conforme pour diffusion";
    public static final String SUMMARY_REVIEW = "Vérification manuelle avant diffusion";
    public static final String SUMMARY_REJECTED = "Contenu non diffusable en l'état : corrigez les points signalés";

    static final int BASE_RISK = 10;
    static final int BASE_QUALITY = 85;
    static final int OCR_TEXT_LIMIT = 200;
    static final int DURATION_TOLERANCE_SECONDS = 2;
    static final String OCR_PREFIX = "texte dans l'image : ";
    static final String INCOHERENT_TEXT = "texte incohérent ou non professionnel";
    public static final String WEBM_UNSUPPORTED = "analyse vidéo impossible (format WebM)";
    public static final String DURATION_MISMATCH = "durée déclarée incohérente avec le fichier";

    /** A media file with the same checksum already used by another advertiser's campaign. */
    public record DuplicateHit(Long mediaId, Long otherCampaignId) {
    }

    public record AnalysisInput(
            String name,
            String objective,
            BigDecimal budget,
            List<MediaInput> media,
            List<AiModerationRule> rules,
            List<DuplicateHit> duplicates,
            Long campaignId,
            CalibrationSnapshot calibration
    ) {

        public AnalysisInput(String name, String objective, BigDecimal budget, List<MediaInput> media,
                             List<AiModerationRule> rules, List<DuplicateHit> duplicates) {
            this(name, objective, budget, media, rules, duplicates, null, CalibrationSnapshot.DEFAULT);
        }
    }

    public record AnalysisOutcome(
            AiCheckStatus status,
            int riskScore,
            int qualityScore,
            List<AiIssue> issues,
            List<AiMatchedRule> matchedRules,
            List<String> recommendations,
            String recommendation,
            AiSector sector,
            String extractedText,
            OcrEngine ocrEngine,
            List<AiMediaAnalysis> mediaAnalyses,
            AiContentType contentType,
            Long primaryMediaId,
            AiEngine engine,
            String reason,
            String providerModel
    ) {

        public List<String> issueLabels() {
            return issues.stream().map(AiIssue::getLabel).toList();
        }
    }

    private final OcrService ocrService;
    private final TextRuleEngine ruleEngine;
    private final MediaMetadataAnalyzer mediaAnalyzer;
    private final SectorClassifier sectorClassifier;
    private final VideoFrameExtractor videoExtractor;
    private final ThumbnailStore thumbnailStore;
    private final int analysisMaxSide;

    @Autowired
    public ContentAnalysisPipeline(OcrService ocrService, AiAnalysisProperties properties, ThumbnailStore thumbnailStore) {
        this(ocrService, new VideoFrameExtractor(properties.getVideo().getTimeoutSeconds()), thumbnailStore,
                properties.getImage().getAnalysisMaxSide());
    }

    /** Defaults without thumbnails (tests). */
    public ContentAnalysisPipeline(OcrService ocrService) {
        this(ocrService, new VideoFrameExtractor(20), null, 512);
    }

    public ContentAnalysisPipeline(OcrService ocrService, VideoFrameExtractor videoExtractor, ThumbnailStore thumbnailStore,
                                   int analysisMaxSide) {
        this.ocrService = ocrService;
        this.ruleEngine = new TextRuleEngine();
        this.mediaAnalyzer = new MediaMetadataAnalyzer();
        this.sectorClassifier = new SectorClassifier();
        this.videoExtractor = videoExtractor;
        this.thumbnailStore = thumbnailStore;
        this.analysisMaxSide = analysisMaxSide;
    }

    public AnalysisOutcome analyze(AnalysisInput input) {
        Accumulator acc = new Accumulator();
        CalibrationSnapshot calibration = input.calibration() == null ? CalibrationSnapshot.DEFAULT : input.calibration();
        String name = input.name() == null ? "" : input.name();
        String objective = input.objective() == null ? "" : input.objective();
        String rawText = objective.isBlank() ? name : name + "\n" + objective;
        String normalizedText = TextNormalizer.normalize(rawText);
        List<MediaInput> media = input.media() == null ? List.of() : input.media();

        // OCR, image metrics, video frames, media metadata
        List<AiMediaAnalysis> analyses = new ArrayList<>();
        Set<String> ocrTexts = new LinkedHashSet<>();
        OcrEngine[] ocrEngine = {OcrEngine.AUCUN};
        for (MediaInput item : media) {
            analyses.add(analyzeMedia(item, input.campaignId(), acc, ocrTexts, ocrEngine));
        }
        String extractedText = ocrTexts.isEmpty() ? null : String.join("\n", ocrTexts);
        String normalizedOcr = TextNormalizer.normalize(extractedText);

        // Rules, weighted by the active calibration
        boolean critical = false;
        boolean high = false;
        Map<String, AiMatchedRule> matched = new LinkedHashMap<>();
        Set<String> countedRules = new HashSet<>();
        for (TextRuleEngine.RuleHit hit : ruleEngine.evaluate(input.rules(), normalizedText, normalizedOcr)) {
            AiModerationRule rule = hit.rule();
            AiModerationSeverity severity = rule.getSeverity() == null ? AiModerationSeverity.MEDIUM : rule.getSeverity();
            String ruleKey = rule.getId() != null ? "id:" + rule.getId() : "name:" + rule.getRuleName();
            int points = countedRules.add(ruleKey) ? weightedPoints(severity, calibration.weight(rule.getId())) : 0;
            String label = hit.inOcr() ? OCR_PREFIX + hit.description() : hit.description();
            acc.risk(label, hit.inOcr() ? AiIssueSource.OCR : AiIssueSource.REGLE, severity, points);
            matched.putIfAbsent(ruleKey, AiMatchedRule.builder()
                    .ruleId(rule.getId()).ruleName(rule.getRuleName()).severity(severity).build());
            critical |= severity == AiModerationSeverity.CRITICAL;
            high |= severity == AiModerationSeverity.HIGH;
        }

        // Text heuristics
        int letters = TextNormalizer.letterCount(rawText);
        if (letters >= 12 && TextNormalizer.uppercaseRatio(rawText) > 0.60) {
            acc.risk("texte en majuscules", AiIssueSource.TEXTE, AiModerationSeverity.LOW, 10);
            acc.quality("texte en majuscules", null, -10, "Évitez d'écrire le texte entièrement en majuscules");
        }
        if (rawText.contains("!!!")) {
            acc.risk("ponctuation excessive", AiIssueSource.TEXTE, AiModerationSeverity.LOW, 5);
        }
        if (TextNormalizer.looksIncoherent(rawText)) {
            acc.risk(INCOHERENT_TEXT, AiIssueSource.TEXTE, AiModerationSeverity.MEDIUM, 25);
            acc.quality(INCOHERENT_TEXT, AiIssueSource.TEXTE, -20,
                    "Rédigez un nom et un objectif clairs, en phrases compréhensibles par le public");
        }
        if (input.budget() == null || input.budget().signum() <= 0) {
            acc.risk("budget insuffisant", AiIssueSource.TEXTE, AiModerationSeverity.MEDIUM, 25);
        }
        if (objective.isBlank()) {
            acc.quality("objectif absent", AiIssueSource.TEXTE, -25,
                    "Décrivez l'objectif et l'offre de la campagne en quelques phrases");
        }
        if (rawText.trim().length() < 30) {
            acc.quality("texte trop court", AiIssueSource.TEXTE, -15,
                    "Rédigez un texte plus explicite (au moins 30 caractères)");
        }
        if (media.isEmpty()) {
            acc.quality("aucun visuel fourni", AiIssueSource.IMAGE, -15,
                    "Ajoutez au moins un visuel (image ou vidéo) adapté aux écrans");
        }
        if (extractedText != null && extractedText.length() > OCR_TEXT_LIMIT) {
            acc.quality("trop de texte dans le visuel", AiIssueSource.OCR, -10,
                    "Allégez le texte présent dans le visuel pour une lecture rapide");
        }

        // Duplicates
        if (input.duplicates() != null) {
            Set<Long> seen = new HashSet<>();
            for (DuplicateHit duplicate : input.duplicates()) {
                if (duplicate.otherCampaignId() != null && seen.add(duplicate.otherCampaignId())) {
                    acc.risk("média identique à celui de la campagne #" + duplicate.otherCampaignId(),
                            AiIssueSource.DOUBLON, AiModerationSeverity.MEDIUM, 15);
                }
            }
        }

        // Sector
        String sectorText = normalizedOcr.isBlank() ? normalizedText : normalizedText + "\n" + normalizedOcr;
        AiSector sector = sectorClassifier.classify(sectorText).sector();
        if (sector == AiSector.SANTE) {
            acc.risk("secteur sensible (santé) : allégations à vérifier", AiIssueSource.SECTEUR,
                    AiModerationSeverity.MEDIUM, 10);
        }

        int risk = clamp(BASE_RISK + acc.riskPoints);
        int quality = clamp(BASE_QUALITY + acc.qualityPoints);
        AiCheckStatus status = status(critical, high, risk, quality, calibration);

        String reason = acc.issues.isEmpty()
                ? "Analyse locale : aucun problème détecté"
                : "Analyse locale : " + acc.issues.size() + " point(s) signalé(s)";

        return new AnalysisOutcome(
                status, risk, quality,
                List.copyOf(acc.issues.values()),
                List.copyOf(matched.values()),
                List.copyOf(acc.recommendations),
                summary(status),
                sector,
                extractedText,
                ocrEngine[0],
                analyses,
                contentType(media),
                media.isEmpty() ? null : media.get(0).id(),
                AiEngine.LOCAL,
                reason,
                null);
    }

    /** REJECTED if critical ∨ risk &gt; R; REVIEW_REQUIRED if risk ≥ A ∨ high ∨ quality &lt; 40; else APPROVED. */
    static AiCheckStatus status(boolean critical, boolean high, int risk, int quality, CalibrationSnapshot calibration) {
        if (critical || risk > calibration.rejectThreshold()) {
            return AiCheckStatus.REJECTED;
        }
        if (risk >= calibration.approveThreshold() || high || quality < 40) {
            return AiCheckStatus.REVIEW_REQUIRED;
        }
        return AiCheckStatus.APPROVED;
    }

    static int weightedPoints(AiModerationSeverity severity, double weight) {
        return (int) Math.round(TextRuleEngine.riskPoints(severity) * weight);
    }

    private AiMediaAnalysis analyzeMedia(MediaInput item, Long campaignId, Accumulator acc, Set<String> ocrTexts,
                                         OcrEngine[] ocrEngine) {
        AiMediaAnalysis analysis = AiMediaAnalysis.builder()
                .mediaId(item.id())
                .fileName(item.fileName())
                .contentType(item.isVideo() ? AiContentType.VIDEO : AiContentType.IMAGE)
                .widthPx(item.widthPx())
                .heightPx(item.heightPx())
                .durationSeconds(item.durationSeconds())
                .issues(new ArrayList<>())
                .frames(new ArrayList<>())
                .build();
        MediaInput effective = item;
        List<MediaFinding> findings = new ArrayList<>();

        if (item.isImage()) {
            BufferedImage image = decode(item.path());
            OcrService.OcrResult ocr = image != null ? safeOcr(image, item) : safeOcr(item);
            analysis.setOcrEngine(ocr.engine());
            analysis.setOcrConfidence(ocr.meanConfidence());
            if (ocr.hasText()) {
                analysis.setExtractedText(ocr.text());
                ocrTexts.add(ocr.text());
                ocrEngine[0] = strongest(ocrEngine[0], ocr.engine());
            }
            if (image != null) {
                AiMediaAnalysis.ImageMetrics metrics = ImageAnalyzer.analyze(image, ocr.boxes(), analysisMaxSide);
                analysis.setMetrics(metrics);
                if (item.widthPx() == null || item.heightPx() == null) {
                    analysis.setWidthPx(metrics.getWidth());
                    analysis.setHeightPx(metrics.getHeight());
                    effective = item.withDimensions(metrics.getWidth(), metrics.getHeight());
                }
                findings.addAll(ImageAnalyzer.metricFindings(metrics, AiIssueSource.IMAGE));
            } else if (item.path() != null) {
                findings.add(MediaFinding.quality(ImageAnalyzer.DECODE_FAILED, AiIssueSource.IMAGE, 0,
                        "Vérifiez que le fichier image n'est pas corrompu (JPEG, PNG ou WebP)"));
            }
        } else if (item.isVideo() && videoExtractor != null) {
            VideoFrameExtractor.VideoProbe probe = videoExtractor.extract(item.path(), item.mimeType(), item.fileName());
            if (!probe.supported()) {
                analysis.setVideoSupported(false);
                findings.add(MediaFinding.quality(WEBM_UNSUPPORTED, AiIssueSource.VIDEO, 0,
                        "Préférez le format MP4 (H.264) pour une analyse complète de la vidéo"));
            } else if (item.path() != null) {
                analysis.setVideoSupported(true);
                effective = analyzeVideo(item, probe, campaignId, analysis, findings, ocrTexts, ocrEngine);
            }
        }

        for (MediaFinding finding : mediaAnalyzer.analyze(effective)) {
            findings.add(finding);
        }
        for (MediaFinding finding : findings) {
            if (!analysis.getIssues().contains(finding.label())) {
                analysis.getIssues().add(finding.label());
            }
            acc.quality(finding.label(), finding.source(), finding.qualityDelta(), finding.recommendation());
            if (finding.riskPoints() > 0) {
                acc.riskOnce(finding.riskLabel(), AiIssueSource.IMAGE, AiModerationSeverity.LOW, finding.riskPoints());
            }
        }
        return analysis;
    }

    private MediaInput analyzeVideo(MediaInput item, VideoFrameExtractor.VideoProbe probe, Long campaignId,
                                    AiMediaAnalysis analysis, List<MediaFinding> findings, Set<String> ocrTexts,
                                    OcrEngine[] ocrEngine) {
        MediaInput effective = item;
        Integer container = probe.roundedDurationSeconds();
        analysis.setContainerDurationSeconds(container);
        if (probe.width() != null && probe.height() != null && (item.widthPx() == null || item.heightPx() == null)) {
            analysis.setWidthPx(probe.width());
            analysis.setHeightPx(probe.height());
            effective = effective.withDimensions(probe.width(), probe.height());
        }
        if (probe.durationSeconds() != null) {
            if (item.durationSeconds() != null
                    && Math.abs(item.durationSeconds() - probe.durationSeconds()) > DURATION_TOLERANCE_SECONDS) {
                findings.add(MediaFinding.quality(DURATION_MISMATCH, AiIssueSource.VIDEO, -5,
                        "Vérifiez la durée indiquée lors de l'envoi de la vidéo"));
            }
            effective = effective.withDuration(container);
        }

        List<AiMediaAnalysis.ImageMetrics> frameMetrics = new ArrayList<>();
        Set<String> videoTexts = new LinkedHashSet<>();
        double confidenceSum = 0;
        int confidenceCount = 0;
        OcrEngine videoEngine = OcrEngine.AUCUN;
        for (VideoFrameExtractor.Frame frame : probe.frames()) {
            OcrService.OcrResult ocr = safeOcr(frame.image(), item);
            videoEngine = strongestEngine(videoEngine, ocr.engine());
            if (ocr.meanConfidence() != null) {
                confidenceSum += ocr.meanConfidence();
                confidenceCount++;
            }
            AiMediaAnalysis.ImageMetrics metrics = ImageAnalyzer.analyze(frame.image(), ocr.boxes(), analysisMaxSide);
            frameMetrics.add(metrics);
            if (ocr.hasText()) {
                videoTexts.add(ocr.text());
                ocrEngine[0] = strongest(ocrEngine[0], ocr.engine());
            }
            analysis.getFrames().add(AiMediaAnalysis.Frame.builder()
                    .label(frame.label())
                    .positionSeconds(frame.positionSeconds())
                    .extractedText(ocr.hasText() ? ocr.text() : null)
                    .metrics(metrics)
                    .build());
        }
        if (!probe.frames().isEmpty()) {
            analysis.setOcrEngine(videoEngine);
            analysis.setOcrConfidence(confidenceCount == 0 ? null : Math.round(confidenceSum / confidenceCount * 10d) / 10d);
            AiMediaAnalysis.ImageMetrics worst = ImageAnalyzer.worst(frameMetrics);
            analysis.setMetrics(worst);
            findings.addAll(ImageAnalyzer.metricFindings(worst, AiIssueSource.VIDEO));
            VideoFrameExtractor.Frame middle = probe.middleFrame();
            if (thumbnailStore != null && middle != null) {
                analysis.setThumbnailPath(thumbnailStore.store(campaignId, item.id(), item.path(), middle.image()));
            }
        }
        if (!videoTexts.isEmpty()) {
            String text = String.join("\n", videoTexts);
            analysis.setExtractedText(text);
            ocrTexts.addAll(videoTexts);
        }
        return effective;
    }

    /**
     * Merges a vision provider verdict into the local outcome: risk = max, quality = min, status = most severe,
     * issues and recommendations = union, engine = LOCAL_OPENAI or LOCAL_ANTHROPIC (docs/round2-contract.md §2.5).
     */
    public AnalysisOutcome mergeProvider(AnalysisOutcome local, ProviderVerdict verdict, AiProviderType type) {
        int risk = clamp(Math.max(local.riskScore(), verdict.riskScore()));
        int quality = clamp(Math.min(local.qualityScore(), verdict.qualityScore()));
        AiCheckStatus status = mostSevere(local.status(), verdict.status());
        AiIssueSource source = type == AiProviderType.ANTHROPIC ? AiIssueSource.ANTHROPIC : AiIssueSource.OPENAI;

        Map<String, AiIssue> issues = new LinkedHashMap<>();
        local.issues().forEach(issue -> issues.put(key(issue.getLabel()), issue));
        for (String label : verdict.issues()) {
            if (label != null && !label.isBlank()) {
                issues.putIfAbsent(key(label), AiIssue.builder().label(label.trim())
                        .severity(AiModerationSeverity.MEDIUM).source(source).build());
            }
        }
        Set<String> recommendations = new LinkedHashSet<>(local.recommendations());
        if (verdict.recommendation() != null && !verdict.recommendation().isBlank()) {
            recommendations.add(verdict.recommendation().trim());
        }
        String reason = "Analyse locale + " + providerName(type)
                + (verdict.reason() != null && !verdict.reason().isBlank() ? " : " + verdict.reason().trim() : "");

        return new AnalysisOutcome(status, risk, quality, List.copyOf(issues.values()), local.matchedRules(),
                List.copyOf(recommendations), summary(status), local.sector(), local.extractedText(),
                local.ocrEngine(), local.mediaAnalyses(), local.contentType(), local.primaryMediaId(),
                type == AiProviderType.ANTHROPIC ? AiEngine.LOCAL_ANTHROPIC : AiEngine.LOCAL_OPENAI, reason,
                verdict.model());
    }

    /** Local result kept after a provider failure; the reason mentions the fallback. */
    public AnalysisOutcome withFallbackReason(AnalysisOutcome local, String fallbackMessage) {
        return new AnalysisOutcome(local.status(), local.riskScore(), local.qualityScore(), local.issues(),
                local.matchedRules(), local.recommendations(), local.recommendation(), local.sector(),
                local.extractedText(), local.ocrEngine(), local.mediaAnalyses(), local.contentType(),
                local.primaryMediaId(), AiEngine.LOCAL, local.reason() + " (" + fallbackMessage + ")", null);
    }

    public static String providerName(AiProviderType type) {
        return type == AiProviderType.ANTHROPIC ? "Anthropic" : "OpenAI";
    }

    public static String summary(AiCheckStatus status) {
        return switch (status) {
            case APPROVED -> SUMMARY_APPROVED;
            case REVIEW_REQUIRED -> SUMMARY_REVIEW;
            case REJECTED -> SUMMARY_REJECTED;
        };
    }

    static AiCheckStatus mostSevere(AiCheckStatus a, AiCheckStatus b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        return a.ordinal() >= b.ordinal() ? a : b;
    }

    static AiContentType contentType(List<MediaInput> media) {
        if (media.stream().anyMatch(MediaInput::isVideo)) {
            return AiContentType.VIDEO;
        }
        if (media.stream().anyMatch(MediaInput::isImage)) {
            return AiContentType.IMAGE;
        }
        return AiContentType.TEXTE;
    }

    private static BufferedImage decode(Path path) {
        if (path == null) {
            return null;
        }
        try {
            return ImageIO.read(path.toFile());
        } catch (Exception ex) {
            return null;
        }
    }

    private OcrService.OcrResult safeOcr(MediaInput item) {
        try {
            OcrService.OcrResult result = ocrService.extract(item.path(), item.fileName());
            return result == null ? OcrService.OcrResult.none() : result;
        } catch (RuntimeException ex) {
            return OcrService.OcrResult.none();
        }
    }

    private OcrService.OcrResult safeOcr(BufferedImage image, MediaInput item) {
        try {
            OcrService.OcrResult result = ocrService.extractImage(image, item.path(), item.fileName());
            return result == null ? OcrService.OcrResult.none() : result;
        } catch (RuntimeException ex) {
            return OcrService.OcrResult.none();
        }
    }

    private static OcrEngine strongest(OcrEngine current, OcrEngine candidate) {
        return strongestEngine(current, candidate);
    }

    private static OcrEngine strongestEngine(OcrEngine current, OcrEngine candidate) {
        if (candidate == OcrEngine.TESSERACT || current == OcrEngine.TESSERACT) {
            return OcrEngine.TESSERACT;
        }
        if (candidate == OcrEngine.SIMULE || current == OcrEngine.SIMULE) {
            return OcrEngine.SIMULE;
        }
        return OcrEngine.AUCUN;
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private static String key(String label) {
        return TextNormalizer.normalize(label).trim();
    }

    /** Collects issues (deduplicated by label), score deltas and recommendations. */
    private static final class Accumulator {
        private final Map<String, AiIssue> issues = new LinkedHashMap<>();
        private final Set<String> qualityLabels = new HashSet<>();
        private final Set<String> onceRiskLabels = new HashSet<>();
        private final Set<String> recommendations = new LinkedHashSet<>();
        private int riskPoints;
        private int qualityPoints;

        void risk(String label, AiIssueSource source, AiModerationSeverity severity, int points) {
            riskPoints += points;
            issues.putIfAbsent(key(label), AiIssue.builder().label(label).severity(severity).source(source).build());
        }

        /** Risk counted once per label, whatever the number of media showing it. */
        void riskOnce(String label, AiIssueSource source, AiModerationSeverity severity, int points) {
            if (onceRiskLabels.add(key(label))) {
                risk(label, source, severity, points);
            }
        }

        /** Each quality issue label is counted once, whatever the number of media showing it. */
        void quality(String label, AiIssueSource source, int delta, String recommendation) {
            if (!qualityLabels.add(key(label))) {
                return;
            }
            qualityPoints += delta;
            if (source != null) {
                issues.putIfAbsent(key(label), AiIssue.builder().label(label)
                        .severity(AiModerationSeverity.LOW).source(source).build());
            }
            if (recommendation != null) {
                recommendations.add(recommendation);
            }
        }
    }
}
