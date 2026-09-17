package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.AiSector;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiDashboardResponse {
    private long totalChecks;
    private double avgRiskScore;
    private double avgQualityScore;
    private long approvedCount;
    private long reviewRequiredCount;
    private long rejectedCount;
    private long adminValidatedCount;
    private long adminRejectedCount;
    private double validationRate;
    private double rejectionRate;
    private long overrideCount;
    private long disagreementCount;
    private List<SectorCount> bySector;
    private List<IssueCount> topIssues;

    public record SectorCount(AiSector sector, long count) {
    }

    public record IssueCount(String label, long count) {
    }
}
