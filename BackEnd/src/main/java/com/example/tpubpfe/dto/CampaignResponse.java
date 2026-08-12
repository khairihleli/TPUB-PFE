package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignResponse {

    private Long id;
    private Long clientId;
    private String name;
    private String objective;
    private BigDecimal budget;
    private BigDecimal consumedBudget;
    private String status;
    private String aiStatus;
    private String adminStatus;
    private LocalDate startDate;
    private LocalDate endDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private Long estimatedViews;
    private Short priorityScore;
    private Instant createdAt;
    private Instant submittedAt;
    private Instant validatedAt;
}
