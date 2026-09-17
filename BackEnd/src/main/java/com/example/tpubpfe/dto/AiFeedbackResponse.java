package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/** One administrator decision compared with the AI verdict (docs/round2-contract.md §2.7). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiFeedbackResponse {
    private Long id;
    private Long campaignId;
    private String campaignName;
    private Long checkId;
    private Long decisionLogId;
    private String aiStatus;
    private String adminDecision;
    private String outcome;
    private int riskScore;
    private int qualityScore;
    private List<Long> matchedRuleIds;
    private Integer calibrationVersion;
    private String decidedByName;
    private Instant createdAt;
}
