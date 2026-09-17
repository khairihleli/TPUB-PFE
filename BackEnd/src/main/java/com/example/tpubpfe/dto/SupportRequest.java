package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.validation.AllowedIntValues;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
    @Min(1)
    private Short diffusionCapacity;

    /** Optional ; 0..100 ; on update null = unchanged. Weighs estimated views (contract §2.6). */
    @DecimalMin("0")
    @DecimalMax("100")
    private BigDecimal visibilityScore;

    /** Optional ; "A" | "B" | "C" | "D" ; on update null = unchanged. */
    @Pattern(regexp = "^[ABCD]$", message = "must be one of A, B, C, D")
    private String porteurType;

    /** Optional ; 15 | 20 | 25 | 30 ; on update null = unchanged. */
    @AllowedIntValues(value = {15, 20, 25, 30}, message = "must be one of 15, 20, 25, 30")
    private Integer mastHeightM;

    /** Optional ; 0..359 (0 = north, clockwise) ; on update null = unchanged. */
    @Min(0)
    @Max(359)
    private Integer headingDeg;

    /** Optional ; max 255 ; on update null = unchanged, blank = cleared. */
    @Size(max = 255)
    private String address;
}
