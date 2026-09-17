package com.example.tpubpfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * A booked or blocked period on a support. Deliberately carries no campaign, client or cost data.
 * {@code kind} is {@code RESERVATION} (then {@code reservationStatus} is set) or {@code BLOCAGE}
 * (then {@code reservationStatus} is null and {@code startDate == endDate}).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportAvailabilitySlot {

    private LocalDate startDate;
    private LocalDate endDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;
    private String kind;
    private String availabilityStatus;
    private String reason;
    private String reservationStatus;
}
