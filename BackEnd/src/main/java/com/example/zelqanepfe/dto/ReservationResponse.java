package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservationResponse {

    private Long id;
    private Long campaignId;
    private String campaignName;
    private String campaignStatus;
    private String clientCompanyName;
    private Long zoneId;
    private String zoneName;
    private Long supportId;
    private String supportName;
    private String supportType;
    private LocalDate startDate;
    private LocalDate endDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;
    private String availabilityStatus;
    private String reservationStatus;
    private Long estimatedViews;
    /** Dynamic cost frozen at booking time (docs/round2-contract.md §4.6). */
    private BigDecimal estimatedCost;
    /** R1 cost before the multiplier (equals estimatedCost for reservations created before V8). */
    private BigDecimal baseCost;
    private BigDecimal priceMultiplier;
    private Instant createdAt;
    private Instant cancelledAt;
    private String cancelReason;
    private Instant expiredAt;
    /** Whether the current caller may cancel this reservation. */
    private boolean cancellable;
}
