package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentType;
import com.example.tpubpfe.model.AiEngine;
import com.example.tpubpfe.model.AiIssue;
import com.example.tpubpfe.model.AiIssueSource;
import com.example.tpubpfe.model.AiMatchedRule;
import com.example.tpubpfe.model.AiMediaAnalysis;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiSector;
import com.example.tpubpfe.model.OcrEngine;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Local content analysis (completion contract §2.2): rules, heuristics, media metadata, OCR, sector, status and
 * recommendations. Deterministic for a given input; persistence is handled by {@code AiVerificationService}.
 */
@Component
public class ContentAnalysisPipeline {

    public static final String SUMMARY_APPROVED = "Contenu conforme pour diffusion";
    public static final String SUMMARY_REVIEW = "Vérification manuelle avant diffusion";
    public static final String SUMMARY_REJECTED = "Contenu non diffusable en l'état : corrigez les points signalés";

    static final int BASE_RISK = 10;
    static final int BASE_QUALITY = 85;
    static final int OCR_TEXT_LIMIT = 200;
    static final String OCR_PREFIX = "texte dans l'image : ";
    static final String INCOHERENT_TEXT = "texte incohérent ou non professionnel";

    /** A media file with the same checksum already used by another advertiser's campaign. */
    public record DuplicateHit(Long mediaId, Long otherCampaignId) {
    }

    public record AnalysisInput(
            String name,
            String objective,
            BigDecimal budget,
            List<MediaInput> media,
            List<AiModerationRule> rules,
            List<DuplicateHit> duplicates
    ) {
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
            String reason
    ) {

        public List<String> issueLabels() {
            return issues.stream().map(AiIssue::getLabel).toList();
        }
    }

    private final OcrService ocrService;
    private final TextRuleEngine ruleEngine;
    private final MediaMetadataAnalyzer mediaAnalyzer;
    private final SectorClassifier sectorClassifier;

    @Autowired
    public ContentAnalysisPipeline(OcrService ocrService) {
        this(ocrService, new TextRuleEngine(), new MediaMetadataAnalyzer(), new SectorClassifier());
    }

    ContentAnalysisPipeline(OcrService ocrService, TextRuleEngine ruleEngine, MediaMetadataAnalyzer mediaAnalyzer,
                            SectorClassifier sectorClassifier) {
        this.ocrService = ocrService;
        this.ruleEngine = ruleEngine;
        this.mediaAnalyzer = mediaAnalyzer;
        this.sectorClassifier = sectorClassifier;
    }

    public AnalysisOutcome analyze(AnalysisInput input) {
        Accumulator acc = new Accumulator();
        String name = input.name() == null ? "" : input.name();
        String objective = input.objective() == null ? "" : input.objective();
        String rawText = objective.isBlank() ? name : name + "\n" + objective;
        String normalizedText = TextNormalizer.normalize(rawText);
        List<MediaInput> media = input.media() == null ? List.of() : input.media();

        // OCR + media metadata
        List<AiMediaAnalysis> analyses = new ArrayList<>();
        List<String> ocrTexts = new ArrayList<>();
        OcrEngine ocrEngine = OcrEngine.AUCUN;
        for (MediaInput item : media) {
            AiMediaAnalysis analysis = AiMediaAnalysis.builder()
                    .mediaId(item.id())
                    .fileName(item.fileName())
                    .contentType(item.isVideo() ? AiContentType.VIDEO : AiContentType.IMAGE)
                    .widthPx(item.widthPx())
                    .heightPx(item.heightPx())
                    .durationSeconds(item.durationSeconds())
                    .issues(new ArrayList<>())
                    .build();
            if (item.isImage()) {
                OcrService.OcrResult ocr = safeOcr(item);
                if (ocr.hasText()) {
                    analysis.setExtractedText(ocr.text());
                    ocrTexts.add(ocr.text());
                    ocrEngine = strongest(ocrEngine, ocr.engine());
                }
            }
            for (MediaMetadataAnalyzer.MediaFinding finding : mediaAnalyzer.analyze(item)) {
                analysis.getIssues().add(finding.label());
                acc.quality(finding.label(), finding.source(), finding.qualityDelta(), finding.recommendation());
            }
            analyses.add(analysis);
        }
        String extractedText = ocrTexts.isEmpty() ? null : String.join("\n", ocrTexts);
        String normalizedOcr = TextNormalizer.normalize(extractedText);

        // Rules
        boolean critical = false;
        boolean high = false;
        Map<String, AiMatchedRule> matched = new LinkedHashMap<>();
        Set<String> countedRules = new HashSet<>();
        for (TextRuleEngine.RuleHit hit : ruleEngine.evaluate(input.rules(), normalizedText, normalizedOcr)) {
            AiModerationRule rule = hit.rule();
            AiModerationSeverity severity = rule.getSeverity() == null ? AiModerationSeverity.MEDIUM : rule.getSeverity();
            String ruleKey = rule.getId() != null ? "id:" + rule.getId() : "name:" + rule.getRuleName();
            int points = countedRules.add(ruleKey) ? TextRuleEngine.riskPoints(severity) : 0;
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
        AiCheckStatus status;
        if (critical || risk > 70) {
            status = AiCheckStatus.REJECTED;
        } else if (risk >= 31 || high || quality < 40) {
            status = AiCheckStatus.REVIEW_REQUIRED;
        } else {
            status = AiCheckStatus.APPROVED;
        }

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
                ocrEngine,
                analyses,
                contentType(media),
                media.isEmpty() ? null : media.get(0).id(),
                AiEngine.LOCAL,
                reason);
    }

    /**
     * Merges an OpenAI opinion into the local outcome: risk = max, quality = min, status = most severe,
     * issues = union (source OPENAI), engine = LOCAL_OPENAI.
     */
    public AnalysisOutcome mergeOpenAi(AnalysisOutcome local, AiAnalysisResult openAi) {
        int risk = clamp(Math.max(local.riskScore(), openAi.riskScore()));
        int quality = clamp(Math.min(local.qualityScore(), openAi.qualityScore()));
        AiCheckStatus status = mostSevere(local.status(), openAi.aiStatus());

        Map<String, AiIssue> issues = new LinkedHashMap<>();
        local.issues().forEach(issue -> issues.put(key(issue.getLabel()), issue));
        if (openAi.detectedIssues() != null) {
            for (String label : openAi.detectedIssues()) {
                if (label != null && !label.isBlank()) {
                    issues.putIfAbsent(key(label), AiIssue.builder().label(label.trim())
                            .severity(AiModerationSeverity.MEDIUM).source(AiIssueSource.OPENAI).build());
                }
            }
        }
        Set<String> recommendations = new LinkedHashSet<>(local.recommendations());
        if (openAi.recommendation() != null && !openAi.recommendation().isBlank()) {
            recommendations.add(openAi.recommendation().trim());
        }
        String reason = "Analyse locale + OpenAI"
                + (openAi.reason() != null && !openAi.reason().isBlank() ? " : " + openAi.reason().trim() : "");

        return new AnalysisOutcome(status, risk, quality, List.copyOf(issues.values()), local.matchedRules(),
                List.copyOf(recommendations), summary(status), local.sector(), local.extractedText(),
                local.ocrEngine(), local.mediaAnalyses(), local.contentType(), local.primaryMediaId(),
                AiEngine.LOCAL_OPENAI, reason);
    }

    /** Local result kept after an OpenAI failure; the reason mentions the fallback. */
    public AnalysisOutcome withFallbackReason(AnalysisOutcome local, String fallbackMessage) {
        return new AnalysisOutcome(local.status(), local.riskScore(), local.qualityScore(), local.issues(),
                local.matchedRules(), local.recommendations(), local.recommendation(), local.sector(),
                local.extractedText(), local.ocrEngine(), local.mediaAnalyses(), local.contentType(),
                local.primaryMediaId(), AiEngine.LOCAL, local.reason() + " (" + fallbackMessage + ")");
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

    private OcrService.OcrResult safeOcr(MediaInput item) {
        try {
            OcrService.OcrResult result = ocrService.extract(item.path(), item.fileName());
            return result == null ? OcrService.OcrResult.none() : result;
        } catch (RuntimeException ex) {
            return OcrService.OcrResult.none();
        }
    }

    private static OcrEngine strongest(OcrEngine current, OcrEngine candidate) {
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
        private final Set<String> recommendations = new LinkedHashSet<>();
        private int riskPoints;
        private int qualityPoints;

        void risk(String label, AiIssueSource source, AiModerationSeverity severity, int points) {
            riskPoints += points;
            issues.putIfAbsent(key(label), AiIssue.builder().label(label).severity(severity).source(source).build());
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
