package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.model.AiAdminDecision;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.PaymentStatus;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Administrative decisions on campaigns: validation (with AI override), rejection/blocking, priority (§2.1).
 */
@Service
@RequiredArgsConstructor
public class AdminCampaignService {

    static final String DEFAULT_VALIDATION_REASON = "Campagne validée par l'administration TPUB";
    static final String DEFAULT_OVERRIDE_REASON = "Campagne validée malgré l'avis de l'IA (dérogation administrateur)";
    static final String PAYMENT_NOTE = "Simulation créée à la validation";

    private final CampaignRepository campaignRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final PaymentSimulationRepository paymentSimulationRepository;
    private final UserRepository userRepository;
    private final CampaignReservationSync reservationSync;
    private final CampaignMapper campaignMapper;
    private final AuditService auditService;
    private final Clock clock;

    @Transactional
    public CampaignResponse validate(Long campaignId, AdminValidateRequest request) {
        AdminValidateRequest body = request == null ? new AdminValidateRequest() : request;
        Campaign campaign = find(campaignId);
        LocalDate today = LocalDate.now(clock);

        if (!CampaignLifecycle.isValidatable(campaign.getStatus())) {
            throw CampaignErrors.notReviewable();
        }
        boolean override = campaign.getStatus() == CampaignStatus.REVIEW_REQUIRED;
        if (override && !Boolean.TRUE.equals(body.getOverrideAi())) {
            throw CampaignErrors.aiOverrideRequired();
        }
        if (campaign.getEndDate() != null && campaign.getEndDate().isBefore(today)) {
            throw CampaignErrors.periodOver();
        }
        if (!reservationSync.hasLiveTemporary(campaign, today)) {
            throw CampaignErrors.noReservationToConfirm();
        }
        ClientValidationStatus clientStatus = campaign.getClient() != null ? campaign.getClient().getValidationStatus() : null;
        if (clientStatus == ClientValidationStatus.REJECTED || clientStatus == ClientValidationStatus.SUSPENDED) {
            throw CampaignErrors.clientNotAllowed(HttpStatus.CONFLICT);
        }

        Instant now = Instant.now(clock);
        CampaignStatus target = CampaignLifecycle.statusAfterValidation(campaign, today);
        String comment = blankToNull(body.getComment());
        campaign.setAdminStatus(CampaignAdminStatus.VALIDATED);
        campaign.setAiOverride(override);
        campaign.setAdminComment(comment);
        if (body.getPriorityScore() != null) {
            campaign.setPriorityScore(body.getPriorityScore().shortValue());
        }
        campaign.setStatus(target);
        campaign.setValidatedAt(now);
        if (target == CampaignStatus.ACTIVE) {
            campaign.setActivatedAt(now);
        }
        campaignRepository.save(campaign);

        List<Reservation> confirmed = reservationSync.confirmLiveTemporary(campaign, today);
        BigDecimal estimated = confirmed.stream()
                .map(r -> r.getEstimatedCost() == null ? BigDecimal.ZERO : r.getEstimatedCost())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        paymentSimulationRepository.save(PaymentSimulation.builder()
                .campaign(campaign)
                .client(campaign.getClient())
                .amount(estimated)
                .budgetEstimated(estimated)
                .budgetConsumed(BigDecimal.ZERO)
                .paymentStatus(PaymentStatus.SIMULATED)
                .simulatedAt(now)
                .notes(PAYMENT_NOTE)
                .build());
        reservationSync.recomputeEstimatedViews(campaign);

        String decision = override ? "VALIDATED_OVERRIDE" : "VALIDATED";
        String reason = comment != null ? comment : (override ? DEFAULT_OVERRIDE_REASON : DEFAULT_VALIDATION_REASON);
        logDecision(campaign, AiAdminDecision.VALIDATED, decision, reason);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("status", target.name());
        details.put("aiOverride", override);
        details.put("confirmedReservations", confirmed.size());
        details.put("simulatedAmount", estimated);
        if (comment != null) {
            details.put("comment", comment);
        }
        if (body.getPriorityScore() != null) {
            details.put("priorityScore", body.getPriorityScore());
        }
        auditService.record(override ? "CAMPAIGN_VALIDATED_OVERRIDE" : "CAMPAIGN_VALIDATED", "CAMPAIGN", campaign.getId(),
                (override ? "Validation avec dérogation IA de la campagne « " : "Validation de la campagne « ")
                        + campaign.getName() + " »", details);
        return campaignMapper.toResponse(campaign);
    }

    @Transactional
    public CampaignResponse reject(Long campaignId, String rawReason) {
        String reason = rawReason == null ? null : rawReason.trim();
        if (reason == null || reason.length() < 3 || reason.length() > 1000) {
            throw CampaignErrors.rejectReasonRequired();
        }
        Campaign campaign = find(campaignId);
        if (!CampaignLifecycle.isRejectable(campaign.getStatus())) {
            throw CampaignErrors.notReviewable();
        }
        CampaignStatus previous = campaign.getStatus();
        campaign.setStatus(CampaignStatus.BLOCKED);
        campaign.setAdminStatus(CampaignAdminStatus.REJECTED);
        campaign.setRejectionReason(reason);
        campaignRepository.save(campaign);

        List<Long> cancelled = reservationSync.cancel(campaign,
                java.util.Set.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE), reservation -> true);
        reservationSync.recomputeEstimatedViews(campaign);

        logDecision(campaign, AiAdminDecision.REJECTED, "REJECTED", reason);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousStatus", previous.name());
        details.put("reason", reason);
        details.put("cancelledReservations", cancelled);
        auditService.record("CAMPAIGN_REJECTED", "CAMPAIGN", campaign.getId(),
                "Refus de la campagne « " + campaign.getName() + " »", details);
        return campaignMapper.toResponse(campaign);
    }

    @Transactional
    public CampaignResponse setPriority(Long campaignId, int priorityScore) {
        Campaign campaign = find(campaignId);
        if (!CampaignLifecycle.isPriorityEditable(campaign.getStatus())) {
            throw CampaignErrors.priorityNotEditable();
        }
        short previous = campaign.getPriorityScore() == null ? 0 : campaign.getPriorityScore();
        campaign.setPriorityScore((short) Math.max(0, Math.min(10, priorityScore)));
        campaignRepository.save(campaign);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousPriority", previous);
        details.put("priorityScore", campaign.getPriorityScore());
        auditService.record("CAMPAIGN_PRIORITY_CHANGED", "CAMPAIGN", campaign.getId(),
                "Priorité de la campagne « " + campaign.getName() + " » : " + previous + " → " + campaign.getPriorityScore(),
                details);
        return campaignMapper.toResponse(campaign);
    }

    private Campaign find(Long id) {
        return campaignRepository.findById(id).orElseThrow(CampaignErrors::campaignNotFound);
    }

    /** Marks the latest applied AI check with the admin decision and appends an ADMIN decision log. */
    private void logDecision(Campaign campaign, AiAdminDecision adminDecision, String decision, String reason) {
        AiContentCheck check = aiContentCheckRepository
                .findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(campaign.getId())
                .or(() -> aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDescIdDesc(campaign.getId()))
                .orElseThrow(CampaignErrors::notReviewable);
        check.setAdminDecision(adminDecision);
        aiContentCheckRepository.save(check);
        aiDecisionLogRepository.save(AiDecisionLog.builder()
                .campaign(campaign)
                .check(check)
                .decisionType(AiDecisionType.ADMIN)
                .decision(decision)
                .reason(reason)
                .decidedByUser(currentUser())
                .build());
    }

    private User currentUser() {
        UserDetailsImpl principal = CampaignAccessGuard.currentUser();
        return principal == null ? null : userRepository.findById(principal.getId()).orElse(null);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
