package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiContentType;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.service.ai.AiAnalysisResult;
import com.example.tpubpfe.service.ai.OpenAiAnalysisClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiVerificationService {

    private final AiContentCheckRepository aiContentCheckRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final CampaignRepository campaignRepository;
    private final MediaFileRepository mediaFileRepository;
    private final CampaignService campaignService;
    private final OpenAiAnalysisClient openAiAnalysisClient;

    @Transactional
    public AiReportResponse analyzeCampaign(Long campaignId) {
        Campaign campaign = campaignService.findCampaign(campaignId);

        if (campaign.getStatus() != CampaignStatus.PENDING_AI_CHECK
                && campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw new BadRequestException("Campaign is not eligible for AI analysis");
        }

        List<MediaFile> mediaFiles = mediaFileRepository.findByCampaignId(campaignId);
        AiAnalysisResult analysis = runAnalysis(campaign, mediaFiles);

        AiContentCheck check = AiContentCheck.builder()
                .campaign(campaign)
                .contentType(resolveContentType(mediaFiles))
                .riskScore((short) analysis.riskScore())
                .qualityScore((short) analysis.qualityScore())
                .detectedIssues(analysis.detectedIssues())
                .aiStatus(analysis.aiStatus())
                .aiReason(analysis.reason())
                .recommendation(analysis.recommendation())
                .checkedAt(Instant.now())
                .build();

        check = aiContentCheckRepository.save(check);

        campaign.setAiStatus(mapToCampaignAiStatus(analysis.aiStatus()));
        campaign.setStatus(mapToCampaignStatus(analysis.aiStatus()));
        campaignRepository.save(campaign);

        aiDecisionLogRepository.save(AiDecisionLog.builder()
                .check(check)
                .campaign(campaign)
                .decisionType(AiDecisionType.AI)
                .decision(analysis.aiStatus().name())
                .reason(analysis.reason())
                .build());

        return toReport(check);
    }

    @Transactional(readOnly = true)
    public AiReportResponse getReport(Long campaignId) {
        AiContentCheck check = aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDesc(campaignId)
                .orElseThrow(() -> new BadRequestException("No AI report found for campaign: " + campaignId));
        return toReport(check);
    }

    private AiAnalysisResult runAnalysis(Campaign campaign, List<MediaFile> mediaFiles) {
        if (openAiAnalysisClient.isConfigured()) {
            try {
                log.info("Running OpenAI analysis for campaign {}", campaign.getId());
                return openAiAnalysisClient.analyze(campaign, mediaFiles);
            } catch (Exception ex) {
                log.warn("OpenAI unavailable, falling back to local rules: {}", ex.getMessage());
                return fallbackAnalysis(campaign, "OpenAI indisponible — analyse locale appliquée");
            }
        }

        log.info("OpenAI not configured, using local analysis for campaign {}", campaign.getId());
        return fallbackAnalysis(campaign, "Analyse locale (OpenAI non configurée)");
    }

    private AiAnalysisResult fallbackAnalysis(Campaign campaign, String reason) {
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
            recommendation = "Vérification manuelle avant diffusion";
        }
        if (campaign.getBudget().doubleValue() <= 0) {
            issues.add("budget insuffisant");
            riskScore = Math.max(riskScore, 55);
            aiStatus = AiCheckStatus.REVIEW_REQUIRED;
        }

        return new AiAnalysisResult(aiStatus, riskScore, qualityScore, issues, recommendation, reason);
    }

    private AiContentType resolveContentType(List<MediaFile> mediaFiles) {
        if (mediaFiles.isEmpty()) {
            return AiContentType.TEXTE;
        }
        boolean hasVideo = mediaFiles.stream()
                .anyMatch(m -> m.getFileType() == MediaFileType.VIDEO);
        return hasVideo ? AiContentType.VIDEO : AiContentType.IMAGE;
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
