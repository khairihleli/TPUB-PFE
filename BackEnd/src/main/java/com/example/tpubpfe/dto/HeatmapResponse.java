package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/**
 * {@code GET /api/heatmap/diffusions} and {@code GET /api/heatmap/demand/public} (docs/round2-contract.md §4.5).
 * {@code byZone} is only filled by the public demand endpoint.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeatmapResponse {

    private LocalDate from;
    private LocalDate to;
    private double maxWeight;
    private double totalWeight;
    private HeatmapPoints points;
    private List<PublicZone> byZone;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PublicZone {
        private Long zoneId;
        private String zoneName;
        private double occupancy;
        private long availableSupports;
        private long totalSupports;
    }
}
