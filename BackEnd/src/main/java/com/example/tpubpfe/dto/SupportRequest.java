package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
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
public class SupportRequest {

    @NotNull
    private Long zoneId;

    @NotBlank
    private String name;

    @NotNull
    private SupportType supportType;

    @NotNull
    private BigDecimal latitude;

    @NotNull
    private BigDecimal longitude;

    private TechnicalStatus technicalStatus;
    private Short diffusionCapacity;
}
