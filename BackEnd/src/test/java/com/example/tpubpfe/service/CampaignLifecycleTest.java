package com.example.tpubpfe.service;

import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.TerminationReason;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class CampaignLifecycleTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);

    private static Campaign campaign(CampaignStatus status) {
        return Campaign.builder()
                .status(status)
                .budget(new BigDecimal("100.00"))
                .consumedBudget(BigDecimal.ZERO)
                .startDate(TODAY)
                .endDate(TODAY.plusDays(10))
                .build();
    }

    @Test
    void permissionsFollowTheStatusMachine() {
        assertThat(CampaignLifecycle.isEditable(CampaignStatus.BROUILLON)).isTrue();
        assertThat(CampaignLifecycle.isEditable(CampaignStatus.REJECTED_BY_AI)).isFalse();
        assertThat(CampaignLifecycle.acceptsUpdate(CampaignStatus.REJECTED_BY_AI)).isTrue();
        assertThat(CampaignLifecycle.acceptsUpdate(CampaignStatus.BLOCKED)).isTrue();
        assertThat(CampaignLifecycle.acceptsUpdate(CampaignStatus.APPROVED_BY_AI)).isFalse();
        assertThat(CampaignLifecycle.isDeletable(CampaignStatus.BLOCKED)).isTrue();
        assertThat(CampaignLifecycle.isDeletable(CampaignStatus.ACTIVE)).isFalse();
        assertThat(CampaignLifecycle.isSubmittable(CampaignStatus.BROUILLON)).isTrue();
        assertThat(CampaignLifecycle.isSubmittable(CampaignStatus.PENDING_AI_CHECK)).isFalse();
        assertThat(CampaignLifecycle.isValidatable(CampaignStatus.REVIEW_REQUIRED)).isTrue();
        assertThat(CampaignLifecycle.isValidatable(CampaignStatus.REJECTED_BY_AI)).isFalse();
        assertThat(CampaignLifecycle.isRejectable(CampaignStatus.ACTIVE)).isTrue();
        assertThat(CampaignLifecycle.isRejectable(CampaignStatus.TERMINATED)).isFalse();
        assertThat(CampaignLifecycle.isPriorityEditable(CampaignStatus.VALIDATED_BY_ADMIN)).isTrue();
        assertThat(CampaignLifecycle.isPriorityEditable(CampaignStatus.BROUILLON)).isFalse();
    }

    @Test
    void reopenResetsDecisionsButKeepsRejectionReason() {
        Campaign blocked = campaign(CampaignStatus.BLOCKED);
        blocked.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);
        blocked.setAdminStatus(CampaignAdminStatus.REJECTED);
        blocked.setAiOverride(true);
        blocked.setSubmittedAt(Instant.now());
        blocked.setValidatedAt(Instant.now());
        blocked.setRejectionReason("Visuel trompeur");

        assertThat(CampaignLifecycle.reopen(blocked)).isTrue();

        assertThat(blocked.getStatus()).isEqualTo(CampaignStatus.BROUILLON);
        assertThat(blocked.getAiStatus()).isNull();
        assertThat(blocked.getAdminStatus()).isNull();
        assertThat(blocked.getAiOverride()).isFalse();
        assertThat(blocked.getSubmittedAt()).isNull();
        assertThat(blocked.getValidatedAt()).isNull();
        assertThat(blocked.getRejectionReason()).isEqualTo("Visuel trompeur");
    }

    @ParameterizedTest
    @EnumSource(value = CampaignStatus.class, names = {"BROUILLON", "PENDING_AI_CHECK", "APPROVED_BY_AI", "ACTIVE", "TERMINATED"})
    void reopenIsRefusedOutsideRefusedStatuses(CampaignStatus status) {
        Campaign campaign = campaign(status);
        assertThat(CampaignLifecycle.reopen(campaign)).isFalse();
        assertThat(campaign.getStatus()).isEqualTo(status);
    }

    @Test
    void validationTargetsProgrammedOrActiveDependingOnStartDate() {
        Campaign future = campaign(CampaignStatus.APPROVED_BY_AI);
        future.setStartDate(TODAY.plusDays(1));
        assertThat(CampaignLifecycle.statusAfterValidation(future, TODAY)).isEqualTo(CampaignStatus.VALIDATED_BY_ADMIN);

        Campaign started = campaign(CampaignStatus.APPROVED_BY_AI);
        assertThat(CampaignLifecycle.statusAfterValidation(started, TODAY)).isEqualTo(CampaignStatus.ACTIVE);
    }

    @Test
    void aiResultMapping() {
        assertThat(CampaignLifecycle.statusForAi(AiCheckStatus.APPROVED)).isEqualTo(CampaignStatus.APPROVED_BY_AI);
        assertThat(CampaignLifecycle.statusForAi(AiCheckStatus.REVIEW_REQUIRED)).isEqualTo(CampaignStatus.REVIEW_REQUIRED);
        assertThat(CampaignLifecycle.statusForAi(AiCheckStatus.REJECTED)).isEqualTo(CampaignStatus.REJECTED_BY_AI);
        assertThat(CampaignLifecycle.aiStatusFor(AiCheckStatus.REJECTED)).isEqualTo(CampaignAiStatus.REJECTED);
    }

    @Test
    void schedulerActivatesProgrammedCampaignOnStartDate() {
        Campaign programmed = campaign(CampaignStatus.VALIDATED_BY_ADMIN);
        programmed.setStartDate(TODAY);

        assertThat(CampaignLifecycle.scheduledTransition(programmed, TODAY))
                .contains(new CampaignLifecycle.ScheduledTransition(CampaignStatus.ACTIVE, null));
        assertThat(CampaignLifecycle.scheduledTransition(programmed, TODAY.minusDays(1))).isEmpty();
    }

    @Test
    void schedulerTerminatesOnPeriodEndOrExhaustedBudget() {
        Campaign ended = campaign(CampaignStatus.ACTIVE);
        ended.setEndDate(TODAY.minusDays(1));
        assertThat(CampaignLifecycle.scheduledTransition(ended, TODAY)).contains(
                new CampaignLifecycle.ScheduledTransition(CampaignStatus.TERMINATED, TerminationReason.PERIODE_TERMINEE));

        Campaign exhausted = campaign(CampaignStatus.ACTIVE);
        exhausted.setConsumedBudget(new BigDecimal("100.0000"));
        assertThat(CampaignLifecycle.scheduledTransition(exhausted, TODAY)).contains(
                new CampaignLifecycle.ScheduledTransition(CampaignStatus.TERMINATED, TerminationReason.BUDGET_EPUISE));

        Campaign programmedButOver = campaign(CampaignStatus.VALIDATED_BY_ADMIN);
        programmedButOver.setEndDate(TODAY.minusDays(2));
        assertThat(CampaignLifecycle.scheduledTransition(programmedButOver, TODAY).orElseThrow().target())
                .isEqualTo(CampaignStatus.TERMINATED);
    }

    @Test
    void schedulerIgnoresZeroBudgetAndOtherStatuses() {
        Campaign zeroBudget = campaign(CampaignStatus.ACTIVE);
        zeroBudget.setBudget(BigDecimal.ZERO);
        assertThat(CampaignLifecycle.scheduledTransition(zeroBudget, TODAY)).isEmpty();

        Campaign draft = campaign(CampaignStatus.BROUILLON);
        draft.setEndDate(TODAY.minusDays(3));
        assertThat(CampaignLifecycle.scheduledTransition(draft, TODAY)).isEmpty();
    }
}
