package com.example.zelqanepfe.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmergencyResponse {

    private Long id;
    private String title;
    private String content;
    private Long zoneId;
    private String zoneName;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private BigDecimal radiusKm;
    private Map<String, Object> targetPolygon;
    private LocalDate startDate;
    private LocalDate endDate;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime startTime;
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime endTime;
    private Integer durationSeconds;
    private Short priority;
    private String urgencyLevel;
    private Boolean isActive;
    /** PROGRAMME, EN_COURS, TERMINE or DESACTIVE. */
    private String state;
    private Instant stoppedAt;
    private String stopReason;
    private long affectedSupports;
    private long diffusionCount;
    private String createdByName;
    private Instant createdAt;
    /** Multi-level approval (docs/round2-contract.md §5.4): EN_ATTENTE, APPROUVE or REFUSE. */
    private String approvalStatus;
    /** Effective number of distinct administrators needed (capped by the active administrators). */
    private int approvalsRequired;
    private int approvalsRequiredConfigured;
    @Builder.Default
    private List<ApprovalResponse> approvals = new ArrayList<>();
    private Instant approvedAt;
}
