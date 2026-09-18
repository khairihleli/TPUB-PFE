package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * {@code GET /api/availability} (contract §2.4).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AvailabilityResponse {

    private LocalDate startDate;
    private LocalDate endDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;
    private long days;
    private double hoursPerDay;
    private List<Item> supports;
    private Summary summary;
    private List<AlternativeSlot> alternatives;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        private SupportResponse support;
        private Double distanceKm;
        private String status;
        private int remainingCapacity;
        private boolean reservedByCampaign;
        private Long campaignReservationId;
        private List<SupportAvailabilitySlot> conflicts;
        private long estimatedViews;
        /** Dynamic cost on the queried window (docs/round2-contract.md §4.6). */
        private BigDecimal estimatedCost;
        private BigDecimal priceMultiplier;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        private long totalSupports;
        private long availableSupports;
        private long reservedSupports;
        private long occupiedSupports;
        private long maintenanceSupports;
        private long offlineSupports;
        private long estimatedViewsAvailable;
        private BigDecimal estimatedCostAvailable;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AlternativeSlot {
        private LocalDate startDate;
        private LocalDate endDate;
        @JsonFormat(pattern = "HH:mm:ss")
        private LocalTime startTime;
        @JsonFormat(pattern = "HH:mm:ss")
        private LocalTime endTime;
        /** MATIN, APRES_MIDI, SOIR, JOURNEE or null. */
        private String preset;
        private long availableSupports;
        private long estimatedViewsAvailable;
    }
}
