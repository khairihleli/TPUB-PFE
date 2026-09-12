package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.AiCheckStatus;

import java.util.List;

public record AiAnalysisResult(
        AiCheckStatus aiStatus,
        int riskScore,
        int qualityScore,
        List<String> detectedIssues,
        String recommendation,
        String reason
) {
}
