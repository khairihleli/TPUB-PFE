package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** An emergency message waiting for its remaining approvals (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PendingEmergencyApproval {

    private Long emergencyId;
    private String title;
    private String urgencyLevel;
    private String zoneName;
    private LocalDate startDate;
    private LocalDate endDate;
    private String createdByName;
    private int approvalsRequired;
    @Builder.Default
    private List<ApprovalResponse> approvals = new ArrayList<>();
    private boolean canApprove;
    private Instant requestedAt;
}
