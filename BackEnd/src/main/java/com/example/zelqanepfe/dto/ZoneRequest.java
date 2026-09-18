package com.example.zelqanepfe.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ZoneRequest {

    @NotBlank
    private String name;

    @NotNull
    private BigDecimal latitude;

    @NotNull
    private BigDecimal longitude;

    private BigDecimal radiusKm;
    private Boolean isActive;
}
