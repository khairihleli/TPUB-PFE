package com.example.tpubpfe.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * Body of {@code PUT /api/campaigns/{id}/zones}: replaces every targeting circle of the campaign.
 * The 1..5 bound is checked in the service to return {@code ZONE_LIMIT_EXCEEDED}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZoneRequest {

    @NotNull
    @Valid
    private List<Circle> zones;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Circle {

        @NotNull
        @DecimalMin("-90")
        @DecimalMax("90")
        private BigDecimal latitude;

        @NotNull
        @DecimalMin("-180")
        @DecimalMax("180")
        private BigDecimal longitude;

        @NotNull
        @DecimalMin("0.1")
        @DecimalMax("50")
        private BigDecimal radiusKm;

        @Size(max = 150)
        private String label;
    }
}
