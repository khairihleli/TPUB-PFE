package com.example.tpubpfe.service;

import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.TerminationReason;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

/**
 * Campaign status machine (completion contract §2.1). Pure rules, no persistence.
 */
public final class CampaignLifecycle {

    public static final Set<CampaignStatus> REOPENABLE = EnumSet.of(CampaignStatus.REJECTED_BY_AI, CampaignStatus.BLOCKED);
    public static final Set<CampaignStatus> DELETABLE =
            EnumSet.of(CampaignStatus.BROUILLON, CampaignStatus.REJECTED_BY_AI, CampaignStatus.BLOCKED);
    public static final Set<CampaignStatus> VALIDATABLE =
            EnumSet.of(CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED);
    public static final Set<CampaignStatus> REJECTABLE = EnumSet.of(
            CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED, CampaignStatus.REJECTED_BY_AI,
            CampaignStatus.VALIDATED_BY_ADMIN, CampaignStatus.ACTIVE);
    public static final Set<CampaignStatus> PRIORITY_EDITABLE = EnumSet.of(
            CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED,
            CampaignStatus.VALIDATED_BY_ADMIN, CampaignStatus.ACTIVE);
    public static final Set<CampaignStatus> SCHEDULED =
            EnumSet.of(CampaignStatus.VALIDATED_BY_ADMIN, CampaignStatus.ACTIVE);

    private CampaignLifecycle() {
    }

    /** Content, zones, media and reservations can be written. */
    public static boolean isEditable(CampaignStatus status) {
        return status == CampaignStatus.BROUILLON;
    }

    /** PUT campaign / PUT zones are accepted (auto-reopen included). */
    public static boolean acceptsUpdate(CampaignStatus status) {
        return isEditable(status) || isReopenable(status);
    }

    public static boolean isReopenable(CampaignStatus status) {
        return REOPENABLE.contains(status);
    }

    public static boolean isDeletable(CampaignStatus status) {
        return DELETABLE.contains(status);
    }

    public static boolean isSubmittable(CampaignStatus status) {
        return status == CampaignStatus.BROUILLON;
    }

    public static boolean isValidatable(CampaignStatus status) {
        return VALIDATABLE.contains(status);
    }

    public static boolean isRejectable(CampaignStatus status) {
        return REJECTABLE.contains(status);
    }

    public static boolean isPriorityEditable(CampaignStatus status) {
        return PRIORITY_EDITABLE.contains(status);
    }

    /**
     * REJECTED_BY_AI | BLOCKED → BROUILLON. The rejection reason is kept until the next admin decision;
     * reservations are untouched.
     *
     * @return true when the campaign was reopened
     */
    public static boolean reopen(Campaign campaign) {
        if (!isReopenable(campaign.getStatus())) {
            return false;
        }
        campaign.setStatus(CampaignStatus.BROUILLON);
        campaign.setAiStatus(null);
        campaign.setAdminStatus(null);
        campaign.setAiOverride(false);
        campaign.setSubmittedAt(null);
        campaign.setValidatedAt(null);
        return true;
    }

    /** Status reached right after an admin validation. */
    public static CampaignStatus statusAfterValidation(Campaign campaign, LocalDate today) {
        if (campaign.getStartDate() != null && today.isBefore(campaign.getStartDate())) {
            return CampaignStatus.VALIDATED_BY_ADMIN;
        }
        return CampaignStatus.ACTIVE;
    }

    public static CampaignStatus statusForAi(AiCheckStatus status) {
        return switch (status) {
            case APPROVED -> CampaignStatus.APPROVED_BY_AI;
            case REVIEW_REQUIRED -> CampaignStatus.REVIEW_REQUIRED;
            case REJECTED -> CampaignStatus.REJECTED_BY_AI;
        };
    }

    public static CampaignAiStatus aiStatusFor(AiCheckStatus status) {
        return switch (status) {
            case APPROVED -> CampaignAiStatus.APPROVED;
            case REVIEW_REQUIRED -> CampaignAiStatus.REVIEW_REQUIRED;
            case REJECTED -> CampaignAiStatus.REJECTED;
        };
    }

    /** A transition decided by the lifecycle scheduler. */
    public record ScheduledTransition(CampaignStatus target, TerminationReason reason) {
    }

    /**
     * VALIDATED_BY_ADMIN → ACTIVE when startDate ≤ today; VALIDATED_BY_ADMIN | ACTIVE → TERMINATED when the period
     * is over or the budget is exhausted. Termination wins over activation.
     */
    public static Optional<ScheduledTransition> scheduledTransition(Campaign campaign, LocalDate today) {
        if (!SCHEDULED.contains(campaign.getStatus())) {
            return Optional.empty();
        }
        if (campaign.getEndDate() != null && campaign.getEndDate().isBefore(today)) {
            return Optional.of(new ScheduledTransition(CampaignStatus.TERMINATED, TerminationReason.PERIODE_TERMINEE));
        }
        BigDecimal budget = campaign.getBudget();
        BigDecimal consumed = campaign.getConsumedBudget() == null ? BigDecimal.ZERO : campaign.getConsumedBudget();
        if (budget != null && budget.signum() > 0 && consumed.compareTo(budget) >= 0) {
            return Optional.of(new ScheduledTransition(CampaignStatus.TERMINATED, TerminationReason.BUDGET_EPUISE));
        }
        if (campaign.getStatus() == CampaignStatus.VALIDATED_BY_ADMIN
                && (campaign.getStartDate() == null || !campaign.getStartDate().isAfter(today))) {
            return Optional.of(new ScheduledTransition(CampaignStatus.ACTIVE, null));
        }
        return Optional.empty();
    }
}
