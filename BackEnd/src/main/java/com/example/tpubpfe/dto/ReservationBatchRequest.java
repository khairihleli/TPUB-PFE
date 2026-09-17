package com.example.tpubpfe.dto;

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
public class ReservationBatchRequest {

    @NotNull
    private Long campaignId;

    @NotEmpty
    @Size(max = 50)
    private List<Long> supportIds;

    private LocalDate startDate;
    private LocalDate endDate;

    @Schema(type = "string", example = "08:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @Schema(type = "string", example = "22:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;
}
