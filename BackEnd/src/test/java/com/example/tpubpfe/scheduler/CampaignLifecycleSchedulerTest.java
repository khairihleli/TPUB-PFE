package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.TerminationReason;
import com.example.tpubpfe.repository.CampaignRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CampaignLifecycleSchedulerTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);

    @Test
    void runOnceAppliesActivationAndTerminations() {
        CampaignRepository repository = mock(CampaignRepository.class);
        Instant now = TODAY.atTime(0, 1).atZone(TUNIS).toInstant();
        CampaignLifecycleScheduler scheduler = new CampaignLifecycleScheduler(repository, Clock.fixed(now, TUNIS));

        Campaign programmed = campaign(1L, CampaignStatus.VALIDATED_BY_ADMIN, TODAY, TODAY.plusDays(3), "0");
        Campaign notYet = campaign(2L, CampaignStatus.VALIDATED_BY_ADMIN, TODAY.plusDays(1), TODAY.plusDays(3), "0");
        Campaign ended = campaign(3L, CampaignStatus.ACTIVE, TODAY.minusDays(9), TODAY.minusDays(1), "0");
        Campaign exhausted = campaign(4L, CampaignStatus.ACTIVE, TODAY.minusDays(1), TODAY.plusDays(9), "50.0000");
        when(repository.findByStatusIn(any())).thenReturn(List.of(programmed, notYet, ended, exhausted));

        scheduler.runOnce();

        assertThat(programmed.getStatus()).isEqualTo(CampaignStatus.ACTIVE);
        assertThat(programmed.getActivatedAt()).isEqualTo(now);
        assertThat(notYet.getStatus()).isEqualTo(CampaignStatus.VALIDATED_BY_ADMIN);
        assertThat(ended.getStatus()).isEqualTo(CampaignStatus.TERMINATED);
        assertThat(ended.getTerminationReason()).isEqualTo(TerminationReason.PERIODE_TERMINEE);
        assertThat(ended.getTerminatedAt()).isEqualTo(now);
        assertThat(exhausted.getTerminationReason()).isEqualTo(TerminationReason.BUDGET_EPUISE);
        verify(repository, times(3)).save(any(Campaign.class));
        verify(repository, never()).save(notYet);
    }

    private static Campaign campaign(Long id, CampaignStatus status, LocalDate start, LocalDate end, String consumed) {
        return Campaign.builder().id(id).status(status).startDate(start).endDate(end)
                .budget(new BigDecimal("50")).consumedBudget(new BigDecimal(consumed)).build();
    }
}
