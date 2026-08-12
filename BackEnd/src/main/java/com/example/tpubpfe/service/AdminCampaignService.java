package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.MessageResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class AdminCampaignService {

    private final CampaignRepository campaignRepository;
    private final ReservationRepository reservationRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final UserRepository userRepository;

    @Transactional
    public CampaignResponse validate(Long campaignId) {
        Campaign campaign = campaignServiceFind(campaignId);
        ensureReviewable(campaign);

        campaign.setAdminStatus(CampaignAdminStatus.VALIDATED);
        campaign.setStatus(CampaignStatus.ACTIVE);
        campaign.setValidatedAt(Instant.now());
        campaignRepository.save(campaign);

        reservationRepository.findByCampaignId(campaignId).forEach(reservation -> {
            reservation.setReservationStatus(ReservationStatus.CONFIRMEE);
            reservationRepository.save(reservation);
        });

        logAdminDecision(campaign, "VALIDATED", "Campaign validated by administrator");
        return CampaignMapper.toResponse(campaign);
    }

    @Transactional
    public MessageResponse reject(Long campaignId, String reason) {
        Campaign campaign = campaignServiceFind(campaignId);
        ensureReviewable(campaign);

        campaign.setAdminStatus(CampaignAdminStatus.REJECTED);
        campaign.setStatus(CampaignStatus.BLOCKED);
        campaignRepository.save(campaign);

        reservationRepository.findByCampaignId(campaignId).forEach(reservation -> {
            reservation.setReservationStatus(ReservationStatus.ANNULEE);
            reservationRepository.save(reservation);
        });

        logAdminDecision(campaign, "REJECTED", reason != null ? reason : "Campaign rejected by administrator");
        return MessageResponse.builder().message("Campaign rejected successfully").build();
    }

    private void ensureReviewable(Campaign campaign) {
        if (campaign.getStatus() != CampaignStatus.APPROVED_BY_AI
                && campaign.getStatus() != CampaignStatus.REVIEW_REQUIRED) {
            throw new BadRequestException("Campaign must be AI-analyzed before admin decision");
        }
    }

    private Campaign campaignServiceFind(Long id) {
        return campaignRepository.findById(id)
                .orElseThrow(() -> new com.example.tpubpfe.exception.ResourceNotFoundException("Campaign not found: " + id));
    }

    private void logAdminDecision(Campaign campaign, String decision, String reason) {
        var check = aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDesc(campaign.getId())
                .orElseThrow(() -> new BadRequestException("AI check required before admin decision"));

        aiDecisionLogRepository.save(AiDecisionLog.builder()
                .campaign(campaign)
                .check(check)
                .decisionType(AiDecisionType.ADMIN)
                .decision(decision)
                .reason(reason)
                .decidedByUser(userRepository.findByEmail(SecurityUtils.getCurrentUserEmail()).orElse(null))
                .build());
    }
}
