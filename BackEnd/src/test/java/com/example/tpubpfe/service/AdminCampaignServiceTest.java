package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AiAdminDecision;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Client;
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
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.UserRepository;
import org.assertj.core.api.ThrowableAssert;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminCampaignServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);

    private CampaignRepository campaignRepository;
    private AiDecisionLogRepository decisionLogRepository;
    private AiContentCheckRepository checkRepository;
    private PaymentSimulationRepository paymentRepository;
    private AuditService auditService;
    private com.example.tpubpfe.service.approval.ApprovalPolicy approvalPolicy;
    private com.example.tpubpfe.service.supervision.AlertService alertService;
    private com.example.tpubpfe.service.notification.NotificationService notificationService;
    private AdminCampaignService service;
    private final List<Reservation> reservations = new ArrayList<>();
    private Campaign campaign;
    private AiContentCheck check;

    @BeforeEach
    void setUp() {
        campaignRepository = mock(CampaignRepository.class);
        decisionLogRepository = mock(AiDecisionLogRepository.class);
        checkRepository = mock(AiContentCheckRepository.class);
        paymentRepository = mock(PaymentSimulationRepository.class);
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        auditService = mock(AuditService.class);
        CampaignMapper mapper = mock(CampaignMapper.class);
        Clock clock = Clock.fixed(TODAY.atTime(9, 30).atZone(TUNIS).toInstant(), TUNIS);
        approvalPolicy = mock(com.example.tpubpfe.service.approval.ApprovalPolicy.class);
        alertService = mock(com.example.tpubpfe.service.supervision.AlertService.class);
        notificationService = mock(com.example.tpubpfe.service.notification.NotificationService.class);
        when(approvalPolicy.configuredForCampaign()).thenReturn(1);
        when(approvalPolicy.effective(anyInt())).thenReturn(1);
        when(approvalPolicy.campaignRiskThreshold()).thenReturn(50);
        when(approvalPolicy.approvals(any(), any(Long.class), anyString())).thenReturn(List.of());
        when(approvalPolicy.toResponses(anyList())).thenReturn(List.of());
        service = new AdminCampaignService(campaignRepository, decisionLogRepository, checkRepository, paymentRepository,
                userRepository, new CampaignReservationSync(reservationRepository, campaignRepository), mapper,
                auditService, approvalPolicy, alertService, notificationService, clock);

        TestAuth.login(1L, "ADMINISTRATEUR");
        User admin = User.builder().id(1L).nom("Admin").build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin));
        campaign = Campaign.builder().id(3L).name("Collection")
                .client(Client.builder().id(5L).validationStatus(ClientValidationStatus.VALIDATED).build())
                .budget(new BigDecimal("400")).startDate(TODAY).endDate(TODAY.plusDays(10))
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(20, 0))
                .status(CampaignStatus.APPROVED_BY_AI).aiStatus(CampaignAiStatus.APPROVED)
                .build();
        check = AiContentCheck.builder().id(70L).campaign(campaign).aiStatus(AiCheckStatus.APPROVED)
                .adminDecision(AiAdminDecision.PENDING).build();
        when(campaignRepository.findById(3L)).thenReturn(Optional.of(campaign));
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));
        when(checkRepository.findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(3L)).thenReturn(Optional.of(check));
        when(reservationRepository.findByCampaignId(3L)).thenReturn(reservations);
        when(reservationRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(mapper.toResponse(any(Campaign.class))).thenAnswer(inv ->
                CampaignResponse.builder().status(((Campaign) inv.getArgument(0)).getStatus().name()).build());

        reservations.add(Reservation.builder().id(1L).reservationStatus(ReservationStatus.TEMPORAIRE)
                .startDate(TODAY).endDate(TODAY.plusDays(5)).estimatedViews(1000L).estimatedCost(new BigDecimal("12.50")).build());
        reservations.add(Reservation.builder().id(2L).reservationStatus(ReservationStatus.TEMPORAIRE)
                .startDate(TODAY.plusDays(1)).endDate(TODAY.plusDays(6)).estimatedViews(500L).estimatedCost(new BigDecimal("7.50")).build());
        reservations.add(Reservation.builder().id(3L).reservationStatus(ReservationStatus.ANNULEE)
                .startDate(TODAY).endDate(TODAY.plusDays(6)).estimatedViews(9000L).estimatedCost(new BigDecimal("99")).build());
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    private static void assertApiError(ThrowableAssert.ThrowingCallable call, HttpStatus status, String code) {
        assertThatThrownBy(call).isInstanceOf(ApiException.class).satisfies(ex -> {
            assertThat(((ApiException) ex).getStatus()).isEqualTo(status);
            assertThat(((ApiException) ex).getCode()).isEqualTo(code);
        });
    }

    @Test
    void validationActivatesConfirmsReservationsAndSimulatesPayment() {
        CampaignResponse response = service.validate(3L,
                AdminValidateRequest.builder().comment("RAS").priorityScore(7).build()).campaign();

        assertThat(response.getStatus()).isEqualTo("ACTIVE");
        assertThat(campaign.getAdminStatus()).isEqualTo(CampaignAdminStatus.VALIDATED);
        assertThat(campaign.getAiOverride()).isFalse();
        assertThat(campaign.getPriorityScore()).isEqualTo((short) 7);
        assertThat(campaign.getAdminComment()).isEqualTo("RAS");
        assertThat(campaign.getValidatedAt()).isNotNull();
        assertThat(campaign.getActivatedAt()).isEqualTo(campaign.getValidatedAt());
        assertThat(reservations.get(0).getReservationStatus()).isEqualTo(ReservationStatus.CONFIRMEE);
        assertThat(reservations.get(1).getReservationStatus()).isEqualTo(ReservationStatus.CONFIRMEE);
        assertThat(reservations.get(2).getReservationStatus()).isEqualTo(ReservationStatus.ANNULEE);
        assertThat(campaign.getEstimatedViews()).isEqualTo(1500L);
        assertThat(check.getAdminDecision()).isEqualTo(AiAdminDecision.VALIDATED);

        ArgumentCaptor<PaymentSimulation> payment = ArgumentCaptor.forClass(PaymentSimulation.class);
        verify(paymentRepository).save(payment.capture());
        assertThat(payment.getValue().getAmount()).isEqualByComparingTo("20.00");
        assertThat(payment.getValue().getBudgetEstimated()).isEqualByComparingTo("20.00");
        assertThat(payment.getValue().getBudgetConsumed()).isEqualByComparingTo("0");
        assertThat(payment.getValue().getPaymentStatus()).isEqualTo(PaymentStatus.SIMULATED);
        assertThat(payment.getValue().getNotes()).isEqualTo("Simulation créée à la validation");

        ArgumentCaptor<AiDecisionLog> log = ArgumentCaptor.forClass(AiDecisionLog.class);
        verify(decisionLogRepository).save(log.capture());
        assertThat(log.getValue().getDecisionType()).isEqualTo(AiDecisionType.ADMIN);
        assertThat(log.getValue().getDecision()).isEqualTo("VALIDATED");
        assertThat(log.getValue().getReason()).isEqualTo("RAS");
        assertThat(log.getValue().getDecidedByUser().getId()).isEqualTo(1L);
        verify(auditService).record(eq("CAMPAIGN_VALIDATED"), eq("CAMPAIGN"), eq(3L), anyString(), anyMap());
    }

    @Test
    void futureCampaignIsProgrammed() {
        campaign.setStartDate(TODAY.plusDays(1));
        assertThat(service.validate(3L, null).campaign().getStatus()).isEqualTo("VALIDATED_BY_ADMIN");
        assertThat(campaign.getActivatedAt()).isNull();
    }

    @Test
    void reviewRequiredNeedsAnExplicitOverride() {
        campaign.setStatus(CampaignStatus.REVIEW_REQUIRED);
        campaign.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);

        assertApiError(() -> service.validate(3L, null), HttpStatus.BAD_REQUEST, "AI_OVERRIDE_REQUIRED");
        assertApiError(() -> service.validate(3L, AdminValidateRequest.builder().overrideAi(false).build()),
                HttpStatus.BAD_REQUEST, "AI_OVERRIDE_REQUIRED");
        verify(paymentRepository, never()).save(any());

        service.validate(3L, AdminValidateRequest.builder().overrideAi(true).build());

        assertThat(campaign.getStatus()).isEqualTo(CampaignStatus.ACTIVE);
        assertThat(campaign.getAiOverride()).isTrue();
        ArgumentCaptor<AiDecisionLog> log = ArgumentCaptor.forClass(AiDecisionLog.class);
        verify(decisionLogRepository).save(log.capture());
        assertThat(log.getValue().getDecision()).isEqualTo("VALIDATED_OVERRIDE");
        assertThat(log.getValue().getReason()).isEqualTo(AdminCampaignService.DEFAULT_OVERRIDE_REASON);
        verify(auditService).record(eq("CAMPAIGN_VALIDATED_OVERRIDE"), eq("CAMPAIGN"), eq(3L), anyString(), anyMap());
    }

    @Test
    void validationGates() {
        campaign.setStatus(CampaignStatus.REJECTED_BY_AI);
        assertApiError(() -> service.validate(3L, null), HttpStatus.CONFLICT, "CAMPAIGN_NOT_REVIEWABLE");

        campaign.setStatus(CampaignStatus.APPROVED_BY_AI);
        campaign.setEndDate(TODAY.minusDays(1));
        assertApiError(() -> service.validate(3L, null), HttpStatus.CONFLICT, "CAMPAIGN_PERIOD_OVER");

        campaign.setEndDate(TODAY.plusDays(10));
        reservations.forEach(r -> r.setEndDate(TODAY.minusDays(1)));
        assertApiError(() -> service.validate(3L, null), HttpStatus.CONFLICT, "NO_RESERVATION_TO_CONFIRM");

        reservations.forEach(r -> r.setEndDate(TODAY.plusDays(2)));
        campaign.getClient().setValidationStatus(ClientValidationStatus.SUSPENDED);
        assertApiError(() -> service.validate(3L, null), HttpStatus.CONFLICT, "CLIENT_NOT_ALLOWED");
    }

    @Test
    void rejectBlocksCancelsReservationsAndKeepsTheReason() {
        campaign.setStatus(CampaignStatus.ACTIVE);
        reservations.get(0).setReservationStatus(ReservationStatus.CONFIRMEE);

        CampaignResponse response = service.reject(3L, "  Visuel trompeur  ");

        assertThat(response.getStatus()).isEqualTo("BLOCKED");
        assertThat(campaign.getAdminStatus()).isEqualTo(CampaignAdminStatus.REJECTED);
        assertThat(campaign.getRejectionReason()).isEqualTo("Visuel trompeur");
        assertThat(reservations).extracting(Reservation::getReservationStatus).containsOnly(ReservationStatus.ANNULEE);
        assertThat(campaign.getEstimatedViews()).isZero();
        assertThat(check.getAdminDecision()).isEqualTo(AiAdminDecision.REJECTED);
        verify(auditService).record(eq("CAMPAIGN_REJECTED"), eq("CAMPAIGN"), eq(3L), anyString(), anyMap());
    }

    @Test
    void rejectRequiresAReasonAndAReviewableStatus() {
        assertApiError(() -> service.reject(3L, null), HttpStatus.BAD_REQUEST, "REJECT_REASON_REQUIRED");
        assertApiError(() -> service.reject(3L, "  a "), HttpStatus.BAD_REQUEST, "REJECT_REASON_REQUIRED");

        campaign.setStatus(CampaignStatus.BROUILLON);
        assertApiError(() -> service.reject(3L, "Contenu interdit"), HttpStatus.CONFLICT, "CAMPAIGN_NOT_REVIEWABLE");
    }

    @Test
    void priorityIsEditableOnlyForReviewedCampaigns() {
        campaign.setStatus(CampaignStatus.VALIDATED_BY_ADMIN);
        service.setPriority(3L, 9);
        assertThat(campaign.getPriorityScore()).isEqualTo((short) 9);
        verify(auditService).record(eq("CAMPAIGN_PRIORITY_CHANGED"), eq("CAMPAIGN"), eq(3L), anyString(),
                org.mockito.ArgumentMatchers.<Map<String, Object>>any());

        campaign.setStatus(CampaignStatus.TERMINATED);
        assertApiError(() -> service.setPriority(3L, 2), HttpStatus.CONFLICT, "PRIORITY_NOT_EDITABLE");
    }
    // --- multi-level approval (docs/round2-contract.md §5.4) ------------------------------------------------------

    /** Makes the policy ask for two distinct administrators and keeps the recorded approvals in memory. */
    private java.util.List<com.example.tpubpfe.model.Approval> requireTwoAdministrators() {
        java.util.List<com.example.tpubpfe.model.Approval> recorded = new ArrayList<>();
        when(approvalPolicy.configuredForCampaign()).thenReturn(2);
        when(approvalPolicy.effective(anyInt())).thenReturn(2);
        when(approvalPolicy.approvals(any(), any(Long.class), anyString())).thenReturn(recorded);
        when(approvalPolicy.record(any(), any(), anyString(), any(), any(), any(), any())).thenAnswer(inv -> {
            com.example.tpubpfe.model.Approval approval = com.example.tpubpfe.model.Approval.builder()
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
            java.util.List<com.example.tpubpfe.model.Approval> list = inv.getArgument(0);
            return list.stream().map(a -> com.example.tpubpfe.dto.ApprovalResponse.builder()
                    .id(a.getId()).approverUserId(a.getApproverUserId())
                    .approverName("Admin " + a.getApproverUserId())
                    .decision(a.getDecision().name()).comment(a.getComment()).createdAt(a.getCreatedAt())
                    .build()).toList();
        });
        return recorded;
    }

    @Test
    void anOverrideNeedsTwoAdministrators() {
        requireTwoAdministrators();
        campaign.setStatus(CampaignStatus.REVIEW_REQUIRED);
        campaign.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);

        AdminCampaignService.ValidationOutcome first = service.validate(3L,
                AdminValidateRequest.builder().overrideAi(true).priorityScore(8).build());

        assertThat(first.isPending()).isTrue();
        assertThat(first.campaign()).isNull();
        assertThat(first.pending().isRequired()).isTrue();
        assertThat(first.pending().getReasons()).containsExactly("DEROGATION_IA");
        assertThat(first.pending().getApprovalsRequired()).isEqualTo(2);
        assertThat(first.pending().getApprovalsRequiredConfigured()).isEqualTo(2);
        assertThat(first.pending().getApprovals()).hasSize(1);
        // Nothing of the validation happened yet.
        assertThat(campaign.getStatus()).isEqualTo(CampaignStatus.REVIEW_REQUIRED);
        assertThat(campaign.getAdminStatus()).isNotEqualTo(CampaignAdminStatus.VALIDATED);
        verify(paymentRepository, never()).save(any());
        verify(decisionLogRepository, never()).save(any());
        verify(alertService).openIfAbsent(eq(com.example.tpubpfe.model.SupervisionAlertType.CAMPAIGN_PENDING_APPROVAL),
                any(), anyString(), anyString(), any());
        verify(notificationService).notifyRoles(anySet(),
                eq(com.example.tpubpfe.model.NotificationType.CAMPAIGN_APPROVAL_REQUIRED), any(), anyString(),
                anyString(), anyString(), anyString(), anyString(), anySet());
        verify(auditService).record(eq("CAMPAIGN_APPROVAL_RECORDED"), eq("APPROVAL"), eq(3L), anyString(), anyMap());
    }

    @Test
    void theSameAdministratorCannotApproveTwice() {
        requireTwoAdministrators();
        campaign.setStatus(CampaignStatus.REVIEW_REQUIRED);
        campaign.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);
        service.validate(3L, AdminValidateRequest.builder().overrideAi(true).build());

        assertApiError(() -> service.validate(3L, AdminValidateRequest.builder().overrideAi(true).build()),
                HttpStatus.CONFLICT, "APPROVAL_ALREADY_GIVEN");
    }

    @Test
    void theSecondAdministratorCompletesTheValidation() {
        requireTwoAdministrators();
        campaign.setStatus(CampaignStatus.REVIEW_REQUIRED);
        campaign.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);
        service.validate(3L, AdminValidateRequest.builder().overrideAi(true).priorityScore(8).build());

        TestAuth.login(2L, "ADMINISTRATEUR");
        AdminCampaignService.ValidationOutcome second = service.validate(3L,
                AdminValidateRequest.builder().overrideAi(true).build());

        assertThat(second.isPending()).isFalse();
        assertThat(second.campaign().getStatus()).isEqualTo("ACTIVE");
        assertThat(campaign.getAdminStatus()).isEqualTo(CampaignAdminStatus.VALIDATED);
        // The priority of the first approval is kept when the last body carries none.
        assertThat(campaign.getPriorityScore()).isEqualTo((short) 8);
        ArgumentCaptor<AiDecisionLog> log = ArgumentCaptor.forClass(AiDecisionLog.class);
        verify(decisionLogRepository).save(log.capture());
        assertThat(log.getValue().getDecision()).isEqualTo("VALIDATED_OVERRIDE");
        assertThat(log.getValue().getReason()).isEqualTo("Validée par Admin 1 et Admin 2");
        verify(alertService).resolve(eq(com.example.tpubpfe.model.SupervisionAlertType.CAMPAIGN_PENDING_APPROVAL), any());
        verify(auditService).record(eq("CAMPAIGN_VALIDATED_OVERRIDE"), eq("CAMPAIGN"), eq(3L), anyString(), anyMap());
    }

    @Test
    void aRiskyCampaignAlsoNeedsTwoAdministrators() {
        requireTwoAdministrators();
        check.setRiskScore((short) 62);

        AdminCampaignService.ValidationOutcome outcome = service.validate(3L, null);

        assertThat(outcome.isPending()).isTrue();
        assertThat(outcome.pending().getReasons()).containsExactly("RISQUE_ELEVE");
        assertThat(outcome.pending().getRiskScore()).isEqualTo(62);
        assertThat(outcome.pending().getRiskThreshold()).isEqualTo(50);
    }

    @Test
    void aQuietCampaignIsValidatedByASingleAdministrator() {
        requireTwoAdministrators();
        check.setRiskScore((short) 12);

        AdminCampaignService.ValidationOutcome outcome = service.validate(3L, null);

        assertThat(outcome.isPending()).isFalse();
        assertThat(outcome.campaign().getStatus()).isEqualTo("ACTIVE");
        verify(alertService, never()).openIfAbsent(any(), any(), anyString(), anyString(), any());
    }

    @Test
    void approvalReasonsRule() {
        assertThat(AdminCampaignService.approvalReasons(false, 10, 50)).isEmpty();
        assertThat(AdminCampaignService.approvalReasons(true, 10, 50)).containsExactly("DEROGATION_IA");
        assertThat(AdminCampaignService.approvalReasons(false, 50, 50)).containsExactly("RISQUE_ELEVE");
        assertThat(AdminCampaignService.approvalReasons(true, 80, 50))
                .containsExactly("DEROGATION_IA", "RISQUE_ELEVE");
        assertThat(AdminCampaignService.approvalReasons(false, null, 50)).isEmpty();
    }

    @Test
    void cycleKeyFollowsTheLatestCheck() {
        assertThat(AdminCampaignService.cycleKey(null)).isEqualTo("check:0");
        assertThat(AdminCampaignService.cycleKey(check)).isEqualTo("check:70");
    }
}
