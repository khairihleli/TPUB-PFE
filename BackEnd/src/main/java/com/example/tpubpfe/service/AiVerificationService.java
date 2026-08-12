package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiContentType;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AiVerificationService {

    private final AiContentCheckRepository aiContentCheckRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final CampaignRepository campaignRepository;
    private final CampaignService campaignService;

    @Transactional
    public AiReportResponse analyzeCampaign(Long campaignId) {
        Campaign campaign = campaignService.findCampaign(campaignId);

        if (campaign.getStatus() != CampaignStatus.PENDING_AI_CHECK
                && campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw new BadRequestException("Campaign is not eligible for AI analysis");
        }

        List<String> issues = new ArrayList<>();
        int riskScore = 20;
        int qualityScore = 75;
        AiCheckStatus aiStatus = AiCheckStatus.APPROVED;
        String recommendation = "Contenu conforme pour diffusion";

        String objective = campaign.getObjective() != null ? campaign.getObjective().toLowerCase() : "";
        if (objective.contains("gratuit") || objective.contains("garanti")) {
            issues.add("texte ambigu");
            riskScore = 62;
            qualityScore = 74;
            aiStatus = AiCheckStatus.REVIEW_REQUIRED;
            recommendation = "verification manuelle avant diffusion";
        }
        if (campaign.getBudget().doubleValue() <= 0) {
            issues.add("budget insuffisant");
            riskScore = Math.max(riskScore, 55);
            aiStatus = AiCheckStatus.REVIEW_REQUIRED;
        }

        AiContentCheck check = AiContentCheck.builder()
                .campaign(campaign)
                .contentType(AiContentType.TEXTE)
                .riskScore((short) riskScore)
                .qualityScore((short) qualityScore)
                .detectedIssues(issues)
                .aiStatus(aiStatus)
                .aiReason("Analyse MVP simulee")
                .recommendation(recommendation)
                .checkedAt(Instant.now())
                .build();

        check = aiContentCheckRepository.save(check);

        CampaignAiStatus campaignAiStatus = mapToCampaignAiStatus(aiStatus);
        CampaignStatus campaignStatus = mapToCampaignStatus(aiStatus);

        campaign.setAiStatus(campaignAiStatus);
        campaign.setStatus(campaignStatus);
        campaignRepository.save(campaign);

        aiDecisionLogRepository.save(AiDecisionLog.builder()
                .check(check)
                .campaign(campaign)
                .decisionType(AiDecisionType.AI)
                .decision(aiStatus.name())
                .reason("Automatic MVP analysis")
                .build());

        return toReport(check);
    }

    @Transactional(readOnly = true)
    public AiReportResponse getReport(Long campaignId) {
        AiContentCheck check = aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDesc(campaignId)
                .orElseThrow(() -> new BadRequestException("No AI report found for campaign: " + campaignId));
        return toReport(check);
    }

    private AiReportResponse toReport(AiContentCheck check) {
        return AiReportResponse.builder()
                .campaignId(check.getCampaign().getId())
                .aiStatus(check.getAiStatus().name().toLowerCase())
                .riskScore(check.getRiskScore().intValue())
                .qualityScore(check.getQualityScore().intValue())
                .detectedIssues(check.getDetectedIssues())
                .recommendation(check.getRecommendation())
                .build();
    }

    private CampaignAiStatus mapToCampaignAiStatus(AiCheckStatus status) {
        return switch (status) {
            case APPROVED -> CampaignAiStatus.APPROVED;
            case REVIEW_REQUIRED -> CampaignAiStatus.REVIEW_REQUIRED;
            case REJECTED -> CampaignAiStatus.REJECTED;
        };
    }

    private CampaignStatus mapToCampaignStatus(AiCheckStatus status) {
        return switch (status) {
            case APPROVED -> CampaignStatus.APPROVED_BY_AI;
            case REVIEW_REQUIRED -> CampaignStatus.REVIEW_REQUIRED;
            case REJECTED -> CampaignStatus.REJECTED_BY_AI;
        };
    }
}
