package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiReportResponse {

    private Long campaignId;
    private String aiStatus;
    private Integer riskScore;
    private Integer qualityScore;
    private List<String> detectedIssues;
    private String recommendation;
}
