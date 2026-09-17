package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.UrgencyLevel;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmergencyRequest {

    @NotBlank
    @Size(max = 200)
    private String title;

    @NotBlank
    @Size(max = 2000)
    private String content;

    /** Optional when a complete circle is given (the zone is then resolved from the point). */
    private Long zoneId;

    @DecimalMin("-90")
    @DecimalMax("90")
    private BigDecimal latitude;

    @DecimalMin("-180")
    @DecimalMax("180")
    private BigDecimal longitude;

    @DecimalMin("0.1")
    @DecimalMax("50")
    private BigDecimal radiusKm;

    /** Round 2: GeoJSON Polygon or MultiPolygon target (exclusive with the circle, docs/round2-contract.md §4.4). */
    private Map<String, Object> polygon;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    @Schema(type = "string", example = "08:00", description = "HH:mm ou HH:mm:ss ; défaut 00:00:00")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime startTime;

    @Schema(type = "string", example = "20:00", description = "HH:mm ou HH:mm:ss ; défaut 23:59:59")
    @JsonFormat(pattern = "HH:mm[:ss]")
    private LocalTime endTime;

    @Min(5)
    @Max(120)
    private Integer durationSeconds;

    @Min(1)
    @Max(32767)
    private Integer priority;

    private UrgencyLevel urgencyLevel;
}
