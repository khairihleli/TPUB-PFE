package com.example.tpubpfe.dto;

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
}
