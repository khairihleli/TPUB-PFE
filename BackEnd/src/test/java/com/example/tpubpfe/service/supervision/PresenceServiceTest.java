package com.example.tpubpfe.service.supervision;

import com.example.tpubpfe.config.SupervisionProperties;
import com.example.tpubpfe.dto.HeartbeatRequest;
import com.example.tpubpfe.dto.HeartbeatResponse;
import com.example.tpubpfe.dto.PresenceEvent;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.NotificationType;
import com.example.tpubpfe.model.PresenceState;
import com.example.tpubpfe.model.SupervisionAlertType;
import com.example.tpubpfe.model.SupportPresence;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.SupportPresenceRepository;
import com.example.tpubpfe.service.notification.NotificationService;
import com.example.tpubpfe.service.realtime.SupervisionBroadcastEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Player presence: heartbeat upsert, back-online resolution and the offline sweep (§5.2). */
class PresenceServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final Instant NOW = LocalDate.of(2026, 9, 16).atTime(10, 0).atZone(TUNIS).toInstant();

    private final Map<Long, SupportPresence> stored = new HashMap<>();
    private SupportPresenceRepository presenceRepository;
    private DiffusionSupportRepository supportRepository;
    private AlertService alertService;
    private NotificationService notificationService;
    private ApplicationEventPublisher publisher;
    private PresenceService service;

    @BeforeEach
    void setUp() {
        presenceRepository = mock(SupportPresenceRepository.class);
        supportRepository = mock(DiffusionSupportRepository.class);
        alertService = mock(AlertService.class);
        notificationService = mock(NotificationService.class);
        publisher = mock(ApplicationEventPublisher.class);
        SupervisionProperties.Supervision properties = new SupervisionProperties.Supervision();
        service = new PresenceService(presenceRepository, supportRepository, alertService, notificationService,
                publisher, properties, Clock.fixed(NOW, TUNIS));
        when(presenceRepository.findById(any())).thenAnswer(i -> Optional.ofNullable(stored.get(i.getArgument(0))));
        when(presenceRepository.save(any(SupportPresence.class))).thenAnswer(i -> {
            SupportPresence presence = i.getArgument(0);
            stored.put(presence.getSupportId(), presence);
            return presence;
        });
        when(supportRepository.findById(7L)).thenReturn(Optional.of(support(TechnicalStatus.ACTIF)));
        when(alertService.openIfAbsent(any(), any(), anyString(), anyString(), any()))
                .thenReturn(Optional.of(com.example.tpubpfe.model.SupervisionAlert.builder().id(1L).build()));
    }

    private static DiffusionSupport support(TechnicalStatus status) {
        return DiffusionSupport.builder().id(7L).name("Écran Habib Bourguiba").technicalStatus(status)
                .supportType(SupportType.ECRAN).latitude(new BigDecimal("36.8")).longitude(new BigDecimal("10.18"))
                .zone(Zone.builder().id(1L).name("Tunis Centre").build()).build();
    }

    @Test
    void firstHeartbeatCreatesThePresenceAndAnnouncesTheScreen() {
        HeartbeatResponse response = service.heartbeat(7L, HeartbeatRequest.builder().playerVersion("1.4.2")
                .currentDiffusionLogId(99L).visible(true).build(), "41.230.0.1");

        assertThat(response.getState()).isEqualTo("EN_LIGNE");
        assertThat(response.getSupportId()).isEqualTo(7L);
        assertThat(response.getNextHeartbeatSeconds()).isEqualTo(30);
        SupportPresence presence = stored.get(7L);
        assertThat(presence.getState()).isEqualTo(PresenceState.EN_LIGNE);
        assertThat(presence.getLastHeartbeatAt()).isEqualTo(NOW);
        assertThat(presence.getPlayerVersion()).isEqualTo("1.4.2");
        assertThat(presence.getLastIp()).isEqualTo("41.230.0.1");
        assertThat(presence.getCurrentDiffusionLogId()).isEqualTo(99L);
        verify(alertService).resolve(eq(SupervisionAlertType.SUPPORT_OFFLINE), any());

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(publisher).publishEvent(events.capture());
        SupervisionBroadcastEvent event = (SupervisionBroadcastEvent) events.getValue();
        assertThat(event.event()).isEqualTo("presence");
        assertThat(((PresenceEvent) event.payload()).getPresence()).isEqualTo("EN_LIGNE");
    }

    @Test
    void aSecondHeartbeatDoesNotAnnounceAnything() {
        service.heartbeat(7L, null, "41.230.0.1");
        service.heartbeat(7L, null, "41.230.0.1");
        verify(publisher).publishEvent(any(Object.class));
    }

    @Test
    void unknownSupportIsRejected() {
        assertThatThrownBy(() -> service.heartbeat(404L, null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUPPORT_NOT_FOUND");
        assertThatThrownBy(() -> service.heartbeat(null, null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MISSING_PARAMETER");
    }

    @Test
    void sweepMarksSilentScreensOfflineAndAlertsForActiveOnes() {
        SupportPresence silent = SupportPresence.builder().supportId(7L).state(PresenceState.EN_LIGNE)
                .lastHeartbeatAt(NOW.minus(Duration.ofMinutes(5))).stateChangedAt(NOW.minus(Duration.ofMinutes(5)))
                .build();
        when(presenceRepository.findByStateAndLastHeartbeatAtBefore(eq(PresenceState.EN_LIGNE), any()))
                .thenReturn(List.of(silent));

        assertThat(service.sweep()).isEqualTo(1);

        assertThat(silent.getState()).isEqualTo(PresenceState.HORS_LIGNE);
        assertThat(silent.getStateChangedAt()).isEqualTo(NOW);
        verify(alertService).openIfAbsent(eq(SupervisionAlertType.SUPPORT_OFFLINE), any(), anyString(), anyString(), any());
        verify(notificationService).notifyRoles(anySet(), eq(NotificationType.SUPPORT_OFFLINE), any(), anyString(),
                anyString(), anyString(), anyString(), anyString(), anySet());
        verify(publisher).publishEvent(any(Object.class));
    }

    @Test
    void sweepDoesNotAlertForAScreenUnderMaintenance() {
        when(supportRepository.findById(7L)).thenReturn(Optional.of(support(TechnicalStatus.MAINTENANCE)));
        SupportPresence silent = SupportPresence.builder().supportId(7L).state(PresenceState.EN_LIGNE)
                .lastHeartbeatAt(NOW.minus(Duration.ofMinutes(5))).stateChangedAt(NOW.minus(Duration.ofMinutes(5)))
                .build();
        when(presenceRepository.findByStateAndLastHeartbeatAtBefore(eq(PresenceState.EN_LIGNE), any()))
                .thenReturn(List.of(silent));

        service.sweep();

        verify(alertService, never()).openIfAbsent(any(), any(), anyString(), anyString(), any());
        verify(notificationService, never()).notifyRoles(anySet(), any(), any(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anySet());
    }

    @Test
    void presenceOfAScreenWithoutRowIsUnknown() {
        assertThat(service.presenceOf(7L)).isEqualTo("INCONNU");
        service.heartbeat(7L, null, null);
        assertThat(service.presenceOf(7L)).isEqualTo("EN_LIGNE");
    }
}
