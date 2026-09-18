package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservationRequest {

    @NotNull
    private Long campaignId;

    /** Ignored: the reservation zone is always the support's zone. */
    private Long zoneId;

    @NotNull
    private Long supportId;

    /** Null: the campaign value. */
    private LocalDate startDate;

    /** Null: the campaign value. */
    private LocalDate endDate;

    @Schema(type = "string", example = "08:00", description = "HH:mm ou HH:mm:ss ; vide = créneau de la campagne")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @Schema(type = "string", example = "22:00", description = "HH:mm ou HH:mm:ss ; vide = créneau de la campagne")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;
}
