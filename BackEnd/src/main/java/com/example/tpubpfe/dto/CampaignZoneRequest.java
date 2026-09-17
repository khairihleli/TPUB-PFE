package com.example.tpubpfe.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Body of {@code PUT /api/campaigns/{id}/zones}: replaces every targeting zone of the campaign, circles and polygons
 * together (docs/round2-contract.md §4.3). The 1..5 bound, the required circle fields and the polygon validation are
 * checked in the service to return {@code ZONE_LIMIT_EXCEEDED}, {@code VALIDATION_FAILED} and {@code INVALID_POLYGON}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZoneRequest {

    @NotNull
    @Valid
    private List<ZoneInput> zones;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ZoneInput {

        /** CERCLE (default when absent) or POLYGONE. */
        @Pattern(regexp = "CERCLE|POLYGONE", message = "Type de zone invalide : CERCLE ou POLYGONE.")
        private String type;

        @DecimalMin("-90")
        @DecimalMax("90")
        private BigDecimal latitude;

        @DecimalMin("-180")
        @DecimalMax("180")
        private BigDecimal longitude;

        @DecimalMin("0.1")
        @DecimalMax("50")
        private BigDecimal radiusKm;

        /** GeoJSON Polygon or MultiPolygon, required for a POLYGONE. */
        private Map<String, Object> polygon;

        @Size(max = 150)
        private String label;
    }
}
