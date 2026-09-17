package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiRuleType;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Applies the moderation rules ({@code ai_moderation_rules}) to normalised text.
 * KEYWORD: comma-separated phrases matched as whole words/phrases. REGEX: case-insensitive Java regex.
 */
@Slf4j
public class TextRuleEngine {

    private static final int MAX_TERMS = 5;

    /** One rule matched in one text (campaign text or OCR text). */
    public record RuleHit(AiModerationRule rule, List<String> terms, boolean inOcr) {

        public String description() {
            String base = rule.getDescription() != null && !rule.getDescription().isBlank()
                    ? rule.getDescription().trim()
                    : "Règle « " + rule.getRuleName() + " » déclenchée";
            if (base.endsWith(".")) {
                base = base.substring(0, base.length() - 1);
            }
            return base + " (« " + String.join(" », « ", terms) + " »)";
        }
    }

    public static int riskPoints(AiModerationSeverity severity) {
        if (severity == null) {
            return 0;
        }
        return switch (severity) {
            case LOW -> 10;
            case MEDIUM -> 25;
            case HIGH -> 45;
            case CRITICAL -> 80;
        };
    }

    /**
     * @param normalizedText    campaign text, already normalised
     * @param normalizedOcrText OCR text, already normalised (may be empty)
     */
    public List<RuleHit> evaluate(List<AiModerationRule> rules, String normalizedText, String normalizedOcrText) {
        List<RuleHit> hits = new ArrayList<>();
        if (rules == null) {
            return hits;
        }
        for (AiModerationRule rule : rules) {
            if (rule == null || Boolean.FALSE.equals(rule.getIsActive()) || rule.getPattern() == null) {
                continue;
            }
            List<String> textTerms = match(rule, normalizedText);
            if (!textTerms.isEmpty()) {
                hits.add(new RuleHit(rule, textTerms, false));
            }
            List<String> ocrTerms = match(rule, normalizedOcrText);
            if (!ocrTerms.isEmpty()) {
                hits.add(new RuleHit(rule, ocrTerms, true));
            }
        }
        return hits;
    }

    List<String> match(AiModerationRule rule, String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        Set<String> terms = new LinkedHashSet<>();
        if (rule.getRuleType() == AiRuleType.REGEX) {
            try {
                Matcher matcher = Pattern.compile(rule.getPattern(), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
                        .matcher(text);
                while (matcher.find() && terms.size() < MAX_TERMS) {
                    String found = matcher.group().trim();
                    terms.add(found.isEmpty() ? rule.getRuleName() : found);
                }
            } catch (PatternSyntaxException ex) {
                log.warn("Règle IA « {} » ignorée : expression régulière invalide ({})", rule.getRuleName(), ex.getDescription());
            }
        } else {
            for (String raw : rule.getPattern().split(",")) {
                String phrase = TextNormalizer.normalize(raw).trim().replaceAll("\\s+", " ");
                if (phrase.isEmpty()) {
                    continue;
                }
                if (TextNormalizer.phrasePattern(phrase).matcher(text).find()) {
                    terms.add(phrase);
                }
                if (terms.size() >= MAX_TERMS) {
                    break;
                }
            }
        }
        return new ArrayList<>(terms);
    }
}
