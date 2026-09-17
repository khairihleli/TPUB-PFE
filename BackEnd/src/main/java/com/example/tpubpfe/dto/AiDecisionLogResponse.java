package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiDecisionLogResponse {
    private Long id;
    private Long campaignId;
    private String campaignName;
    private Long checkId;
    private String decisionType;
    private String decision;
    private String reason;
    private Long decidedByUserId;
    private String decidedByName;
    private int riskScore;
    private int qualityScore;
    private boolean preview;
    private Instant createdAt;
}
