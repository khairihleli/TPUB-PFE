package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * A set of overlapping reservations reaching (SATURE) or exceeding (CONFLIT) a support's capacity.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservationConflictResponse {

    private Long supportId;
    private String supportName;
    private Long zoneId;
    private String zoneName;
    private int capacity;
    private String severity;
    private LocalDate overlapStartDate;
    private LocalDate overlapEndDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime overlapStartTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime overlapEndTime;
    private List<ReservationResponse> reservations;
}
