package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignRequest {

    @NotBlank
    @Size(min = 1, max = 200)
    private String name;

    @Size(max = 5000)
    private String objective;

    @NotNull
    @PositiveOrZero
    private BigDecimal budget;

    @Schema(type = "string", format = "date", example = "2026-06-01")
    private LocalDate startDate;

    @Schema(type = "string", format = "date", example = "2026-08-31")
    private LocalDate endDate;

    @Schema(type = "string", example = "08:00", description = "HH:mm ou HH:mm:ss — laisser vide si non utilisé")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @Schema(type = "string", example = "22:00", description = "HH:mm ou HH:mm:ss — laisser vide si non utilisé")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;
}
