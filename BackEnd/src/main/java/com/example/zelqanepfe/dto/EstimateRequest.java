package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EstimateRequest {

    @NotEmpty
    @Size(max = 100)
    private List<Long> supportIds;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    @NotNull
    @Schema(type = "string", example = "07:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @NotNull
    @Schema(type = "string", example = "23:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;

    /** Round 2: reservations of this campaign are excluded from the occupancy (docs/round2-contract.md §4.6). */
    private Long campaignId;
}
