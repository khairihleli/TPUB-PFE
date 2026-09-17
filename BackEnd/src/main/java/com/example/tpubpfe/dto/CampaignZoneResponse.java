package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;

/**
 * A campaign targeting zone (docs/round2-contract.md §4.3). For a polygon, {@code latitude/longitude} are its centroid
 * and {@code radiusKm} its circumscribed radius.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZoneResponse {
    private Long id;
    private Long zoneId;
    private String zoneName;
    private String label;
    /** CERCLE or POLYGONE. */
    private String type;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private BigDecimal radiusKm;
    /** Normalised GeoJSON, null for a circle. */
    private Map<String, Object> polygon;
    private BigDecimal areaKm2;
    private long supportsInside;
}
