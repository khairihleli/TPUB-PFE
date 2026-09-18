package com.example.zelqanepfe.scheduler;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.EmergencyMessage;
import com.example.zelqanepfe.model.EmergencyStopReason;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.repository.EmergencyMessageRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.service.CampaignReservationSync;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LaneBSchedulersTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);
    private static final Instant NOW = TODAY.atTime(10, 0).atZone(TUNIS).toInstant();
    private static final Clock CLOCK = Clock.fixed(NOW, TUNIS);

    private static Reservation temporary(long id, Campaign campaign, LocalDate end, Instant createdAt) {
        return Reservation.builder().id(id).campaign(campaign).startDate(end.minusDays(1)).endDate(end)
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(12, 0))
                .reservationStatus(ReservationStatus.TEMPORAIRE).createdAt(createdAt).build();
    }

    @Test
    void expiryAppliesPeriodAndTtlRules() {
        ReservationRepository repository = mock(ReservationRepository.class);
        CampaignReservationSync sync = mock(CampaignReservationSync.class);
        ReservationExpiryScheduler scheduler = new ReservationExpiryScheduler(repository, sync, new ZelqaneProperties(), CLOCK);

        Campaign draft = Campaign.builder().id(1L).status(CampaignStatus.BROUILLON).build();
        Campaign submitted = Campaign.builder().id(2L).status(CampaignStatus.REVIEW_REQUIRED).build();
        Campaign rejected = Campaign.builder().id(3L).status(CampaignStatus.REJECTED_BY_AI).build();
        Instant old = NOW.minus(Duration.ofHours(73));
        Instant fresh = NOW.minus(Duration.ofHours(71));

        Reservation ended = temporary(1, submitted, TODAY.minusDays(1), fresh);
        Reservation endsToday = temporary(2, submitted, TODAY, old);
        Reservation staleDraft = temporary(3, draft, TODAY.plusDays(5), old);
        Reservation freshDraft = temporary(4, draft, TODAY.plusDays(5), fresh);
        Reservation staleRejected = temporary(5, rejected, TODAY.plusDays(5), old);
        when(repository.findByReservationStatus(ReservationStatus.TEMPORAIRE))
                .thenReturn(List.of(ended, endsToday, staleDraft, freshDraft, staleRejected));

        scheduler.runOnce();

        assertThat(List.of(ended, staleDraft, staleRejected)).allSatisfy(r -> {
            assertThat(r.getReservationStatus()).isEqualTo(ReservationStatus.EXPIREE);
            assertThat(r.getExpiredAt()).isEqualTo(NOW);
        });
        assertThat(List.of(endsToday, freshDraft))
                .allSatisfy(r -> assertThat(r.getReservationStatus()).isEqualTo(ReservationStatus.TEMPORAIRE));
        verify(repository).saveAll(anyList());
        verify(sync).recomputeEstimatedViews(submitted);
        verify(sync).recomputeEstimatedViews(draft);
        verify(sync).recomputeEstimatedViews(rejected);
        verify(sync, times(3)).recomputeEstimatedViews(any());
    }

    @Test
    void expiryDoesNothingWithoutCandidates() {
        ReservationRepository repository = mock(ReservationRepository.class);
        CampaignReservationSync sync = mock(CampaignReservationSync.class);
        when(repository.findByReservationStatus(ReservationStatus.TEMPORAIRE)).thenReturn(List.of());
        new ReservationExpiryScheduler(repository, sync, new ZelqaneProperties(), CLOCK).runOnce();
        verify(repository, never()).saveAll(anyList());
        verify(sync, never()).recomputeEstimatedViews(any());
    }

    @Test
    void emergencyAutoStopOnlyStopsEndedMessages() {
        EmergencyMessageRepository repository = mock(EmergencyMessageRepository.class);
        EmergencyMessage ended = EmergencyMessage.builder().id(1L).isActive(true)
                .startDate(TODAY).endDate(TODAY).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(9, 59, 59)).build();
        EmergencyMessage running = EmergencyMessage.builder().id(2L).isActive(true)
                .startDate(TODAY).endDate(TODAY).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(10, 0)).build();
        EmergencyMessage allDay = EmergencyMessage.builder().id(3L).isActive(true)
                .startDate(TODAY.minusDays(1)).endDate(TODAY).build();
        when(repository.findByIsActiveTrue()).thenReturn(List.of(ended, running, allDay));

        new EmergencyAutoStopScheduler(repository,
                mock(com.example.zelqanepfe.service.supervision.AlertService.class), CLOCK).runOnce();

        assertThat(ended.getIsActive()).isFalse();
        assertThat(ended.getStopReason()).isEqualTo(EmergencyStopReason.AUTO);
        assertThat(ended.getStoppedAt()).isEqualTo(NOW);
        assertThat(running.getIsActive()).isTrue();
        assertThat(allDay.getIsActive()).isTrue();
        verify(repository).saveAll(List.of(ended));
    }
}
