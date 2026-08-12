package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.UrgencyLevel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
public class EmergencyRequest {

    @NotBlank
    private String title;

    @NotBlank
    private String content;

    @NotNull
    private Long zoneId;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    private LocalTime startTime;
    private LocalTime endTime;
    private Short durationSeconds;
    private Short priority;
    private UrgencyLevel urgencyLevel;
}
