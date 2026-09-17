package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZoneResponse {
    private Long id;
    private Long zoneId;
    private String zoneName;
    private String label;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private BigDecimal radiusKm;
    private long supportsInside;
}
