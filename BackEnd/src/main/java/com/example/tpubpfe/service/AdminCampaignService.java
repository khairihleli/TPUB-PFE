package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.ApprovalResponse;
import com.example.tpubpfe.dto.CampaignApprovalStatus;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.PendingCampaignApproval;
import com.example.tpubpfe.model.AiAdminDecision;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.AlertSeverity;
import com.example.tpubpfe.model.Approval;
import com.example.tpubpfe.model.ApprovalDecision;
import com.example.tpubpfe.model.ApprovalEntityType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.NotificationType;
import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.PaymentStatus;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SupervisionAlertType;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.service.approval.ApprovalErrors;
import com.example.tpubpfe.service.approval.ApprovalPolicy;
import com.example.tpubpfe.service.notification.NotificationService;
import com.example.tpubpfe.service.supervision.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Administrative decisions on campaigns: validation (with AI override), rejection/blocking, priority (§2.1), and the
 * multi-level approval of round 2 (docs/round2-contract.md §5.4).
 */
@Service
@RequiredArgsConstructor
public class AdminCampaignService {

    static final String DEFAULT_VALIDATION_REASON = "Campagne validée par l'administration TPUB";
    static final String DEFAULT_OVERRIDE_REASON = "Campagne validée malgré l'avis de l'IA (dérogation administrateur)";
    static final String PAYMENT_NOTE = "Simulation créée à la validation";
    static final String REASON_OVERRIDE = "DEROGATION_IA";
    static final String REASON_RISK = "RISQUE_ELEVE";

    /** Either the validated campaign, or the approval still waiting for another administrator (202). */
    public record ValidationOutcome(CampaignResponse campaign, CampaignApprovalStatus pending) {

        public boolean isPending() {
            return pending != null;
        }
    }

    private final CampaignRepository campaignRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final PaymentSimulationRepository paymentSimulationRepository;
    private final UserRepository userRepository;
    private final CampaignReservationSync reservationSync;
    private final CampaignMapper campaignMapper;
    private final AuditService auditService;
    private final ApprovalPolicy approvalPolicy;
    private final AlertService alertService;
    private final NotificationService notificationService;
    private final Clock clock;

    @Transactional
    public ValidationOutcome validate(Long campaignId, AdminValidateRequest request) {
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

        // --- multi-level approval (docs/round2-contract.md §5.4) ---------------------------------------------------
        AiContentCheck latestCheck = latestCheck(campaign).orElse(null);
        Integer riskScore = latestCheck == null || latestCheck.getRiskScore() == null
                ? null : latestCheck.getRiskScore().intValue();
        List<String> reasons = approvalReasons(override, riskScore);
        int configured = approvalPolicy.configuredForCampaign();
        int required = approvalPolicy.effective(configured);
        boolean needsDouble = configured >= 2 && !reasons.isEmpty() && required >= 2;
        String cycleKey = cycleKey(latestCheck);
        UserDetailsImpl principal = CampaignAccessGuard.currentUser();
        Long actorId = principal == null ? null : principal.getId();

        List<Approval> cycleApprovals = ApprovalPolicy.approved(
                approvalPolicy.approvals(ApprovalEntityType.CAMPAIGN, campaign.getId(), cycleKey));
        if (needsDouble) {
            if (cycleApprovals.stream().anyMatch(a -> a.getApproverUserId() != null
                    && a.getApproverUserId().equals(actorId))) {
                throw ApprovalErrors.alreadyGiven();
            }
            approvalPolicy.record(ApprovalEntityType.CAMPAIGN, campaign.getId(), cycleKey, actorId,
                    ApprovalDecision.APPROUVE, blankToNull(body.getComment()),
                    approvalDetails(override, body, riskScore));
            cycleApprovals = ApprovalPolicy.approved(
                    approvalPolicy.approvals(ApprovalEntityType.CAMPAIGN, campaign.getId(), cycleKey));
            if (cycleApprovals.size() < required) {
                CampaignApprovalStatus status = status(campaign, cycleKey, reasons, riskScore, configured, required,
                        cycleApprovals, actorId);
                openApprovalAlert(campaign, reasons, riskScore, cycleApprovals);
                auditService.record("CAMPAIGN_APPROVAL_RECORDED", "APPROVAL", campaign.getId(),
                        "Approbation enregistrée pour la campagne « " + campaign.getName() + " » ("
                                + cycleApprovals.size() + "/" + required + ")",
                        approvalDetails(override, body, riskScore));
                return new ValidationOutcome(null, status);
            }
        }

        Instant now = Instant.now(clock);
        CampaignStatus target = CampaignLifecycle.statusAfterValidation(campaign, today);
        String comment = blankToNull(body.getComment());
        Integer priorityScore = effectivePriorityScore(body, cycleApprovals);
        campaign.setAdminStatus(CampaignAdminStatus.VALIDATED);
        campaign.setAiOverride(override);
        campaign.setAdminComment(comment);
        if (priorityScore != null) {
            campaign.setPriorityScore(priorityScore.shortValue());
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
        List<ApprovalResponse> approvers = approvalPolicy.toResponses(cycleApprovals);
        String reason = validationReason(comment, override, needsDouble, approvers);
        logDecision(campaign, AiAdminDecision.VALIDATED, decision, reason);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("status", target.name());
        details.put("aiOverride", override);
        details.put("confirmedReservations", confirmed.size());
        details.put("simulatedAmount", estimated);
        if (comment != null) {
            details.put("comment", comment);
        }
        if (priorityScore != null) {
            details.put("priorityScore", priorityScore);
        }
        if (needsDouble) {
            details.put("approvers", cycleApprovals.stream().map(Approval::getApproverUserId).toList());
            alertService.resolve(SupervisionAlertType.CAMPAIGN_PENDING_APPROVAL,
                    AlertService.AlertRef.campaign(campaign.getId()));
        }
        auditService.record(override ? "CAMPAIGN_VALIDATED_OVERRIDE" : "CAMPAIGN_VALIDATED", "CAMPAIGN", campaign.getId(),
                (override ? "Validation avec dérogation IA de la campagne « " : "Validation de la campagne « ")
                        + campaign.getName() + " »", details);
        return new ValidationOutcome(campaignMapper.toResponse(campaign), null);
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
        // A rejection closes the approval cycle (docs/round2-contract.md §5.4).
        alertService.resolve(SupervisionAlertType.CAMPAIGN_PENDING_APPROVAL,
                AlertService.AlertRef.campaign(campaign.getId()));
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

    // --- approval queries -----------------------------------------------------------------------------------------

    /** Approval state of one campaign ({@code GET /api/approvals/campaigns/{id}}). */
    @Transactional(readOnly = true)
    public CampaignApprovalStatus approvalStatus(Long campaignId) {
        Campaign campaign = find(campaignId);
        AiContentCheck latestCheck = latestCheck(campaign).orElse(null);
        Integer riskScore = latestCheck == null || latestCheck.getRiskScore() == null
                ? null : latestCheck.getRiskScore().intValue();
        boolean override = campaign.getStatus() == CampaignStatus.REVIEW_REQUIRED;
        List<String> reasons = approvalReasons(override, riskScore);
        int configured = approvalPolicy.configuredForCampaign();
        int required = approvalPolicy.effective(configured);
        String cycleKey = cycleKey(latestCheck);
        List<Approval> approvals = ApprovalPolicy.approved(
                approvalPolicy.approvals(ApprovalEntityType.CAMPAIGN, campaign.getId(), cycleKey));
        UserDetailsImpl current = CampaignAccessGuard.currentUser();
        return status(campaign, cycleKey, reasons, riskScore, configured, required, approvals,
                current == null ? null : current.getId());
    }

    /** Campaigns whose validation waits for another administrator ({@code GET /api/approvals/pending}). */
    @Transactional(readOnly = true)
    public List<PendingCampaignApproval> pendingApprovals(Long currentAdminId, boolean canApprove) {
        List<PendingCampaignApproval> pending = new ArrayList<>();
        List<Long> candidates = approvalPolicy.pendingCampaignIds();
        for (Long campaignId : candidates) {
            Campaign campaign = campaignRepository.findById(campaignId).orElse(null);
            if (campaign == null || !CampaignLifecycle.isValidatable(campaign.getStatus())) {
                continue;
            }
            CampaignApprovalStatus status = approvalStatus(campaignId);
            if (!status.isRequired() || status.getApprovals().isEmpty()
                    || status.getApprovals().size() >= status.getApprovalsRequired()) {
                continue;
            }
            boolean already = status.getApprovals().stream()
                    .anyMatch(a -> a.getApproverUserId() != null && a.getApproverUserId().equals(currentAdminId));
            status.setCanApprove(canApprove && !already);
            pending.add(PendingCampaignApproval.builder()
                    .approval(status)
                    .campaignName(campaign.getName())
                    .clientName(campaign.getClient() == null ? null : campaign.getClient().getCompanyName())
                    .status(campaign.getStatus().name())
                    .requestedAt(status.getApprovals().get(0).getCreatedAt())
                    .build());
        }
        return pending;
    }

    // --- helpers --------------------------------------------------------------------------------------------------

    private List<String> approvalReasons(boolean override, Integer riskScore) {
        return approvalReasons(override, riskScore, approvalPolicy.campaignRiskThreshold());
    }

    /** Pure rule: why this validation needs several administrators. */
    public static List<String> approvalReasons(boolean override, Integer riskScore, int riskThreshold) {
        List<String> reasons = new ArrayList<>();
        if (override) {
            reasons.add(REASON_OVERRIDE);
        }
        if (riskScore != null && riskScore >= riskThreshold) {
            reasons.add(REASON_RISK);
        }
        return reasons;
    }

    private CampaignApprovalStatus status(Campaign campaign, String cycleKey, List<String> reasons, Integer riskScore,
                                          int configured, int required, List<Approval> approvals, Long actorId) {
        List<ApprovalResponse> responses = approvalPolicy.toResponses(approvals);
        boolean isAdmin = actorId != null && CampaignAccessGuard.currentUser() != null
                && RoleCode.ADMINISTRATEUR.name().equals(CampaignAccessGuard.currentUser().getRoleCode());
        boolean already = responses.stream()
                .anyMatch(a -> a.getApproverUserId() != null && a.getApproverUserId().equals(actorId));
        return CampaignApprovalStatus.builder()
                .campaignId(campaign.getId())
                .required(configured >= 2 && !reasons.isEmpty() && required >= 2)
                .reasons(reasons)
                .riskScore(riskScore)
                .riskThreshold(approvalPolicy.campaignRiskThreshold())
                .approvalsRequired(required)
                .approvalsRequiredConfigured(configured)
                .approvals(responses)
                .cycleKey(cycleKey)
                .canApprove(isAdmin && !already)
                .build();
    }

    private void openApprovalAlert(Campaign campaign, List<String> reasons, Integer riskScore,
                                   List<Approval> approvals) {
        String title = "Validation à confirmer : " + campaign.getName();
        String message = "La campagne « " + campaign.getName() + " » attend l'approbation d'un second administrateur ("
                + (reasons.contains(REASON_OVERRIDE) ? "dérogation IA" : "risque " + riskScore) + ").";
        alertService.openIfAbsent(SupervisionAlertType.CAMPAIGN_PENDING_APPROVAL, AlertSeverity.AVERTISSEMENT, title,
                message, AlertService.AlertRef.campaign(campaign.getId()));
        Set<Long> approvers = approvals.stream()
                .map(Approval::getApproverUserId)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        notificationService.notifyRoles(Set.of(RoleCode.ADMINISTRATEUR), NotificationType.CAMPAIGN_APPROVAL_REQUIRED,
                AlertSeverity.AVERTISSEMENT, title, message, "/admin/approbations", "CAMPAIGN",
                String.valueOf(campaign.getId()), approvers);
    }

    /** Latest non-preview check, else the latest check of the campaign. */
    private Optional<AiContentCheck> latestCheck(Campaign campaign) {
        return aiContentCheckRepository.findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(campaign.getId())
                .or(() -> aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDescIdDesc(campaign.getId()));
    }

    /** An AI re-run or a resubmission starts a new cycle (docs/round2-contract.md §5.4). */
    static String cycleKey(AiContentCheck check) {
        return "check:" + (check == null || check.getId() == null ? 0 : check.getId());
    }

    static String validationReason(String comment, boolean override, boolean needsDouble,
                                   List<ApprovalResponse> approvers) {
        if (needsDouble) {
            String sentence = ApprovalPolicy.approverSentence(approvers);
            return comment != null ? comment + " — " + sentence : sentence;
        }
        return comment != null ? comment : (override ? DEFAULT_OVERRIDE_REASON : DEFAULT_VALIDATION_REASON);
    }

    /** The request body wins, else the latest non-null priority of the cycle approvals. */
    static Integer effectivePriorityScore(AdminValidateRequest body, List<Approval> approvals) {
        if (body.getPriorityScore() != null) {
            return body.getPriorityScore();
        }
        for (int i = approvals.size() - 1; i >= 0; i--) {
            Map<String, Object> details = approvals.get(i).getDetails();
            Object value = details == null ? null : details.get("priorityScore");
            if (value instanceof Number number) {
                return number.intValue();
            }
        }
        return null;
    }

    private static Map<String, Object> approvalDetails(boolean override, AdminValidateRequest body, Integer riskScore) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("overrideAi", override);
        if (body.getComment() != null && !body.getComment().isBlank()) {
            details.put("comment", body.getComment().trim());
        }
        if (body.getPriorityScore() != null) {
            details.put("priorityScore", body.getPriorityScore());
        }
        if (riskScore != null) {
            details.put("riskScore", riskScore);
        }
        return details;
    }

    private Campaign find(Long id) {
        return campaignRepository.findById(id).orElseThrow(CampaignErrors::campaignNotFound);
    }

    /** Marks the latest applied AI check with the admin decision and appends an ADMIN decision log. */
    private void logDecision(Campaign campaign, AiAdminDecision adminDecision, String decision, String reason) {
        AiContentCheck check = latestCheck(campaign).orElseThrow(CampaignErrors::notReviewable);
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
