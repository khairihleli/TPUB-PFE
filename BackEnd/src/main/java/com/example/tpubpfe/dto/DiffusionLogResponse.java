package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionLogResponse {

    private Long id;
    private Long supportId;
    private String supportName;
    private Long zoneId;
    private String zoneName;
    private Long campaignId;
    private String campaignName;
    private Long emergencyId;
    private String contentType;
    private String title;
    private String mediaUrl;
    private Integer durationSeconds;
    private int priority;
    private BigDecimal cost;
    private long clicks;
    private long interactions;
    private Instant diffusedAt;
    private Instant createdAt;
}
