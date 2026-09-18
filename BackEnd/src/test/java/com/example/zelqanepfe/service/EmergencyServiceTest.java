package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.EmergencyRequest;
import com.example.zelqanepfe.dto.EmergencyResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.EmergencyMessage;
import com.example.zelqanepfe.model.EmergencyStopReason;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.UrgencyLevel;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.EmergencyMessageRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmergencyServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);
    private static final LocalDateTime NOW = TODAY.atTime(10, 0);

    private final Zone centre = Zone.builder().id(1L).name("Tunis Centre").latitude(new BigDecimal("36.8000"))
            .longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private final Zone marsa = Zone.builder().id(2L).name("La Marsa").latitude(new BigDecimal("36.8780"))
            .longitude(new BigDecimal("10.3240")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private EmergencyMessageRepository repository;
    private DiffusionSupportRepository supportRepository;
    private com.example.zelqanepfe.service.approval.ApprovalPolicy approvalPolicy;
    private com.example.zelqanepfe.service.supervision.AlertService alertService;
    private com.example.zelqanepfe.service.notification.NotificationService notificationService;
    private EmergencyService service;

    @BeforeEach
    void setUp() {
        repository = mock(EmergencyMessageRepository.class);
        supportRepository = mock(DiffusionSupportRepository.class);
        ZoneRepository zoneRepository = mock(ZoneRepository.class);
        ZoneService zoneService = mock(ZoneService.class);
        UserRepository userRepository = mock(UserRepository.class);
        approvalPolicy = mock(com.example.zelqanepfe.service.approval.ApprovalPolicy.class);
        alertService = mock(com.example.zelqanepfe.service.supervision.AlertService.class);
        notificationService = mock(com.example.zelqanepfe.service.notification.NotificationService.class);
        when(approvalPolicy.configuredForEmergency()).thenReturn(1);
        when(approvalPolicy.effective(anyInt())).thenReturn(1);
        when(approvalPolicy.approvals(any(), any(Long.class), anyString())).thenReturn(List.of());
        when(approvalPolicy.toResponses(anyList())).thenReturn(List.of());
        service = new EmergencyService(repository, zoneService, zoneRepository, userRepository, supportRepository,
                mock(DiffusionLogRepository.class), mock(AuditService.class), approvalPolicy, alertService,
                notificationService, mock(org.springframework.context.ApplicationEventPublisher.class),
                Clock.fixed(NOW.atZone(TUNIS).toInstant(), TUNIS));
        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of(centre, marsa));
        when(zoneService.findZone(1L)).thenReturn(centre);
        when(userRepository.findById(1L)).thenReturn(Optional.of(User.builder().id(1L).nom("Admin ZELQANE").build()));
        when(repository.save(any(EmergencyMessage.class))).thenAnswer(inv -> inv.getArgument(0));
        when(supportRepository.findAll()).thenReturn(List.of(
                support(1L, "36.8790", "10.3230", TechnicalStatus.ACTIF, marsa),
                support(2L, "36.8795", "10.3235", TechnicalStatus.MAINTENANCE, marsa),
                support(3L, "36.8000", "10.1800", TechnicalStatus.ACTIF, centre)));
        TestAuth.login(1L, "ADMINISTRATEUR");
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    private static DiffusionSupport support(long id, String lat, String lng, TechnicalStatus status, Zone zone) {
        return DiffusionSupport.builder().id(id).name("P" + id).zone(zone).supportType(SupportType.ECRAN)
                .latitude(new BigDecimal(lat)).longitude(new BigDecimal(lng)).technicalStatus(status).build();
    }

    private static EmergencyRequest.EmergencyRequestBuilder request() {
        return EmergencyRequest.builder().title("Route fermée").content("Déviation par l'avenue de France")
                .startDate(TODAY).endDate(TODAY);
    }

    @Test
    void circleWithoutZoneResolvesZoneAndAppliesDefaults() {
        EmergencyResponse response = service.create(request().latitude(new BigDecimal("36.8785"))
                .longitude(new BigDecimal("10.3235")).radiusKm(new BigDecimal("0.5")).build());

        assertThat(response.getZoneId()).isEqualTo(2L);
        assertThat(response.getStartTime()).isEqualTo(LocalTime.MIDNIGHT);
        assertThat(response.getEndTime()).isEqualTo(LocalTime.of(23, 59, 59));
        assertThat(response.getDurationSeconds()).isEqualTo(15);
        assertThat(response.getPriority()).isEqualTo((short) 1);
        assertThat(response.getUrgencyLevel()).isEqualTo("HIGH");
        assertThat(response.getState()).isEqualTo("EN_COURS");
        assertThat(response.getAffectedSupports()).isEqualTo(1);
        assertThat(response.getCreatedByName()).isEqualTo("Admin ZELQANE");
    }

    @Test
    void zoneTargetCountsActiveSupportsOfTheZone() {
        EmergencyResponse response = service.create(request().zoneId(1L).startTime(LocalTime.of(11, 0))
                .endTime(LocalTime.of(12, 0)).urgencyLevel(UrgencyLevel.CRITICAL).durationSeconds(40).build());
        assertThat(response.getAffectedSupports()).isEqualTo(1);
        assertThat(response.getState()).isEqualTo("PROGRAMME");
        assertThat(response.getLatitude()).isNull();
    }

    @Test
    void createValidation() {
        assertThatThrownBy(() -> service.create(request().build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).latitude(new BigDecimal("36.8")).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(9, 0)).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_EMERGENCY_WINDOW");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).startTime(LocalTime.of(12, 0)).endTime(LocalTime.of(11, 0)).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_EMERGENCY_WINDOW");
    }

    @Test
    void stateDerivation() {
        EmergencyMessage message = EmergencyMessage.builder().isActive(true).startDate(TODAY).endDate(TODAY)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(11, 0)).build();
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.EN_COURS);
        assertThat(EmergencyService.state(message, TODAY.atTime(8, 59))).isEqualTo(EmergencyService.State.PROGRAMME);
        assertThat(EmergencyService.state(message, TODAY.atTime(11, 0, 1))).isEqualTo(EmergencyService.State.TERMINE);
        message.setIsActive(false);
        message.setStopReason(EmergencyStopReason.MANUEL);
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.DESACTIVE);
        message.setStopReason(EmergencyStopReason.AUTO);
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.TERMINE);
    }

    @Test
    void deactivateRecordsManualStop() {
        EmergencyMessage message = EmergencyMessage.builder().id(9L).title("T").content("C").zone(centre).isActive(true)
                .startDate(TODAY).endDate(TODAY).urgencyLevel(UrgencyLevel.LOW).priority((short) 1).build();
        when(repository.findById(9L)).thenReturn(Optional.of(message));
        EmergencyResponse response = service.deactivate(9L);
        assertThat(response.getIsActive()).isFalse();
        assertThat(response.getStopReason()).isEqualTo("MANUEL");
        assertThat(response.getState()).isEqualTo("DESACTIVE");
        assertThat(response.getStoppedAt()).isNotNull();

        assertThatThrownBy(() -> service.getAll("inconnu"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_PARAMETER");
    }
    // --- multi-level approval (docs/round2-contract.md §5.4) ------------------------------------------------------

    /** Two administrators required; the recorded approvals are kept in memory. */
    private java.util.List<com.example.zelqanepfe.model.Approval> requireTwoAdministrators() {
        java.util.List<com.example.zelqanepfe.model.Approval> recorded = new java.util.ArrayList<>();
        when(approvalPolicy.configuredForEmergency()).thenReturn(2);
        when(approvalPolicy.effective(anyInt())).thenReturn(2);
        when(approvalPolicy.approvals(any(), any(Long.class), anyString())).thenReturn(recorded);
        when(approvalPolicy.record(any(), any(), anyString(), any(), any(), any(), any())).thenAnswer(inv -> {
            com.example.zelqanepfe.model.Approval approval = com.example.zelqanepfe.model.Approval.builder()
                    .id((long) recorded.size() + 1)
                    .entityType(inv.getArgument(0))
                    .entityId(inv.getArgument(1))
                    .cycleKey(inv.getArgument(2))
                    .approverUserId(inv.getArgument(3))
                    .decision(inv.getArgument(4))
                    .comment(inv.getArgument(5))
                    .details(inv.getArgument(6))
                    .createdAt(java.time.Instant.parse("2026-09-16T08:30:00Z"))
                    .build();
            recorded.add(approval);
            return approval;
        });
        when(approvalPolicy.toResponses(anyList())).thenAnswer(inv -> {
            java.util.List<com.example.zelqanepfe.model.Approval> list = inv.getArgument(0);
            return list.stream().map(a -> com.example.zelqanepfe.dto.ApprovalResponse.builder()
                    .id(a.getId()).approverUserId(a.getApproverUserId())
                    .approverName("Admin " + a.getApproverUserId())
                    .decision(a.getDecision().name()).comment(a.getComment()).createdAt(a.getCreatedAt())
                    .build()).toList();
        });
        return recorded;
    }

    private EmergencyResponse createPending() {
        requireTwoAdministrators();
        when(repository.save(any(EmergencyMessage.class))).thenAnswer(inv -> {
            EmergencyMessage message = inv.getArgument(0);
            if (message.getId() == null) {
                message.setId(11L);
            }
            return message;
        });
        EmergencyResponse response = service.create(request().zoneId(1L).startTime(java.time.LocalTime.of(9, 0))
                .endTime(java.time.LocalTime.of(23, 0)).build());
        EmergencyMessage saved = EmergencyMessage.builder().id(11L).title(response.getTitle())
                .content(response.getContent()).zone(centre).isActive(true)
                .startDate(TODAY).endDate(TODAY).startTime(java.time.LocalTime.of(9, 0))
                .endTime(java.time.LocalTime.of(23, 0)).urgencyLevel(UrgencyLevel.HIGH).priority((short) 1)
                .approvalStatus(com.example.zelqanepfe.model.EmergencyApprovalStatus.EN_ATTENTE)
                .approvalsRequired((short) 2)
                .createdByUser(User.builder().id(1L).nom("Admin ZELQANE").build())
                .build();
        when(repository.findById(11L)).thenReturn(java.util.Optional.of(saved));
        return response;
    }

    @Test
    void aPendingMessageIsNotBroadcastAndRaisesAnAlert() {
        EmergencyResponse response = createPending();

        assertThat(response.getApprovalStatus()).isEqualTo("EN_ATTENTE");
        assertThat(response.getState()).isEqualTo("EN_ATTENTE_APPROBATION");
        assertThat(response.getApprovalsRequired()).isEqualTo(2);
        assertThat(response.getApprovalsRequiredConfigured()).isEqualTo(2);
        assertThat(response.getApprovals()).hasSize(1);
        assertThat(response.getApprovedAt()).isNull();
        verify(alertService).openIfAbsent(
                eq(com.example.zelqanepfe.model.SupervisionAlertType.EMERGENCY_PENDING_APPROVAL), any(), anyString(),
                anyString(), any());
        verify(notificationService).notifyRoles(anySet(),
                eq(com.example.zelqanepfe.model.NotificationType.EMERGENCY_APPROVAL_REQUIRED), any(), anyString(),
                anyString(), anyString(), anyString(), anyString(), anySet());
    }

    @Test
    void aSingleAdministratorBroadcastsImmediately() {
        EmergencyResponse response = service.create(request().zoneId(1L).build());

        assertThat(response.getApprovalStatus()).isEqualTo("APPROUVE");
        assertThat(response.getApprovedAt()).isNotNull();
        assertThat(response.getApprovalsRequired()).isEqualTo(1);
        verify(notificationService).notifyRoles(anySet(),
                eq(com.example.zelqanepfe.model.NotificationType.EMERGENCY_BROADCAST), any(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anySet());
    }

    @Test
    void theSecondAdministratorApprovesAndTheMessageIsBroadcast() {
        createPending();
        TestAuth.login(2L, "ADMINISTRATEUR");

        EmergencyResponse approved = service.approve(11L, "Vérifié avec la protection civile");

        assertThat(approved.getApprovalStatus()).isEqualTo("APPROUVE");
        assertThat(approved.getApprovedAt()).isNotNull();
        assertThat(approved.getState()).isEqualTo("EN_COURS");
        assertThat(approved.getApprovals()).hasSize(2);
        verify(alertService).resolve(
                eq(com.example.zelqanepfe.model.SupervisionAlertType.EMERGENCY_PENDING_APPROVAL), any());
        verify(notificationService).notifyRoles(anySet(),
                eq(com.example.zelqanepfe.model.NotificationType.EMERGENCY_BROADCAST), any(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anySet());
    }

    @Test
    void approvalGuards() {
        createPending();
        // The creator already approved through the creation.
        assertThatThrownBy(() -> service.approve(11L, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("APPROVAL_ALREADY_GIVEN");

        TestAuth.login(2L, "ADMINISTRATEUR");
        service.approve(11L, null);
        assertThatThrownBy(() -> service.approve(11L, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("APPROVAL_NOT_PENDING");
    }

    @Test
    void refusalNeedsAReasonAndAnotherAdministrator() {
        createPending();

        assertThatThrownBy(() -> service.refuse(11L, "  "))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("REFUSAL_REASON_REQUIRED");
        assertThatThrownBy(() -> service.refuse(11L, "Zone déjà couverte"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("APPROVAL_SELF_REFUSAL");

        TestAuth.login(2L, "ADMINISTRATEUR");
        EmergencyResponse refused = service.refuse(11L, "Zone déjà couverte");

        assertThat(refused.getApprovalStatus()).isEqualTo("REFUSE");
        assertThat(refused.getIsActive()).isFalse();
        assertThat(refused.getStopReason()).isEqualTo("REFUSE");
        assertThat(refused.getState()).isEqualTo("REFUSE");
        verify(notificationService).notifyUser(any(),
                eq(com.example.zelqanepfe.model.NotificationType.EMERGENCY_REFUSED), any(), anyString(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void pendingStateWinsOverTheSchedule() {
        EmergencyMessage message = EmergencyMessage.builder().isActive(true).startDate(TODAY).endDate(TODAY)
                .startTime(java.time.LocalTime.of(9, 0)).endTime(java.time.LocalTime.of(11, 0))
                .approvalStatus(com.example.zelqanepfe.model.EmergencyApprovalStatus.EN_ATTENTE).build();
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.EN_ATTENTE_APPROBATION);
        assertThat(EmergencyService.state(message, TODAY.atTime(8, 0)))
                .isEqualTo(EmergencyService.State.EN_ATTENTE_APPROBATION);
        // Once the window is over the message is finished, approved or not.
        assertThat(EmergencyService.state(message, TODAY.atTime(11, 30))).isEqualTo(EmergencyService.State.TERMINE);
        message.setApprovalStatus(com.example.zelqanepfe.model.EmergencyApprovalStatus.REFUSE);
        message.setIsActive(false);
        message.setStopReason(EmergencyStopReason.REFUSE);
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.REFUSE);
        // A message stored before round 2 has no approval status: it stays broadcastable.
        EmergencyMessage legacy = EmergencyMessage.builder().isActive(true).startDate(TODAY).endDate(TODAY)
                .startTime(java.time.LocalTime.of(9, 0)).endTime(java.time.LocalTime.of(11, 0)).build();
        assertThat(EmergencyService.state(legacy, NOW)).isEqualTo(EmergencyService.State.EN_COURS);
    }
}
