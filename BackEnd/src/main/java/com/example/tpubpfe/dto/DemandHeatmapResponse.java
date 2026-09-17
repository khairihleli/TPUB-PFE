package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/** {@code GET /api/heatmap/demand} (docs/round2-contract.md §4.5), staff only. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemandHeatmapResponse {

    private LocalDate from;
    private LocalDate to;
    /** One feature per support with reserved slot-hours, weight = slot-hours. */
    private HeatmapPoints reservations;
    /** One feature per campaign zone of non-draft campaigns overlapping the range, weight = 1. */
    private HeatmapPoints targets;
    private double maxReservationWeight;
    private List<ZoneDemand> byZone;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ZoneDemand {
        private Long zoneId;
        private String zoneName;
        private double reservedHours;
        private double capacityHours;
        private double occupancy;
        private long targets;
    }
}
