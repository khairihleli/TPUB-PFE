package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportResponse {

    private Long id;
    private Long zoneId;
    private String zoneName;
    private String name;
    private String supportType;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private String technicalStatus;
    private Short diffusionCapacity;
    private String porteurType;
    private Short mastHeightM;
    private Short headingDeg;
    private String address;
    /** 0..100, null when unknown. */
    private BigDecimal visibilityScore;
    /** Filled only by availability searches (distance to the searched target). */
    private Double distanceKm;
}
