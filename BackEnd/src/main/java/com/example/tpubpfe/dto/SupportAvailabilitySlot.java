package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * A booked period on a support. Deliberately carries no campaign, client or cost data.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportAvailabilitySlot {

    private LocalDate startDate;
    private LocalDate endDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private String reservationStatus;
}
