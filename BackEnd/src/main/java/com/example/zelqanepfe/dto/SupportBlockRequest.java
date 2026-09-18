package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.AvailabilityStatus;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
public class SupportBlockRequest {

    @NotNull
    private LocalDate startDate;

    /** At most 92 days after {@code startDate} (inclusive range). */
    @NotNull
    private LocalDate endDate;

    @NotNull
    @Schema(type = "string", example = "08:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @NotNull
    @Schema(type = "string", example = "18:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;

    /** MAINTENANCE, HORS_LIGNE or OCCUPE. */
    @NotNull
    private AvailabilityStatus availabilityStatus;

    @Size(max = 255)
    private String reason;
}
