package com.example.tpubpfe.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A moderation rule that matched (stored as JSON in {@code ai_content_checks.matched_rules}). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiMatchedRule {
    private Long ruleId;
    private String ruleName;
    private AiModerationSeverity severity;
}
