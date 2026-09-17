package com.example.tpubpfe.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One problem detected by the AI pipeline (stored as JSON in {@code ai_content_checks.issues}). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiIssue {
    private String label;
    private AiModerationSeverity severity;
    private AiIssueSource source;
}
