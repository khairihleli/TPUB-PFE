package com.example.tpubpfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignResponse {
    private Long id;
    private Long clientId;
    private String clientName;
    private String clientCompanyName;
    private String clientValidationStatus;
    private String name;
    private String objective;
    private BigDecimal budget;
    private BigDecimal consumedBudget;
    private BigDecimal remainingBudget;
    private BigDecimal estimatedCost;
    private String status;
    private String aiStatus;
    private String adminStatus;
    private boolean aiOverride;
    private LocalDate startDate;
    private LocalDate endDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;
    private Long estimatedViews;
    private Short priorityScore;
    private Integer aiRiskScore;
    private Integer aiQualityScore;
    private String aiSector;
    private String rejectionReason;
    private String adminComment;
    private String terminationReason;
    private String mediaUrl;
    private String mediaType;
    private int mediaCount;
    private List<CampaignZoneResponse> zones;
    private int reservationsCount;
    private Long duplicatedFromId;
    private boolean editable;
    private boolean submittable;
    private boolean deletable;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant submittedAt;
    private Instant validatedAt;
    private Instant activatedAt;
    private Instant terminatedAt;
}
