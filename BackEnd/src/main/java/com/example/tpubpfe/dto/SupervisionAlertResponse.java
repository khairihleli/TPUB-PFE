package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One supervision alert (docs/round2-contract.md §5.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupervisionAlertResponse {

    private Long id;
    /** SUPPORT_OFFLINE, ZONE_SATURATION, EMERGENCY_PENDING_APPROVAL, CAMPAIGN_PENDING_APPROVAL. */
    private String type;
    /** INFO, AVERTISSEMENT, CRITIQUE. */
    private String severity;
    private String title;
    private String message;
    private Long supportId;
    private Long zoneId;
    private Long emergencyId;
    private Long campaignId;
    private Instant createdAt;
    private Instant resolvedAt;
    private Instant acknowledgedAt;
    private String acknowledgedByName;
}
