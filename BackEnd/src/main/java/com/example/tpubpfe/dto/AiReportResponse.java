package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.AiIssue;
import com.example.tpubpfe.model.AiMatchedRule;
import com.example.tpubpfe.model.AiMediaAnalysis;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiReportResponse {
    private Long campaignId;
    private Long checkId;
    /** Lowercase: approved | review_required | rejected (kept for backward compatibility). */
    private String aiStatus;
    private Integer riskScore;
    private Integer qualityScore;
    private List<String> detectedIssues;
    private List<AiIssue> issues;
    private String recommendation;
    private List<String> recommendations;
    private String reason;
    private String sector;
    private String contentType;
    private String extractedText;
    private String ocrEngine;
    private String engine;
    private List<AiMediaAnalysis> mediaAnalyses;
    private List<AiMatchedRule> matchedRules;
    private boolean preview;
    private String adminDecision;
    private Instant checkedAt;
}
