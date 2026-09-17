package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.assertj.core.api.ThrowableAssert;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CampaignServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);

    private CampaignRepository campaignRepository;
    private ClientRepository clientRepository;
    private CampaignZoneRepository zoneRepository;
    private ReservationRepository reservationRepository;
    private CampaignAccessGuard guard;
    private CampaignMapper mapper;
    private AiVerificationService aiVerificationService;
    private CampaignService service;
    private Client client;
    private final List<Reservation> reservations = new ArrayList<>();

    @BeforeEach
    void setUp() {
        campaignRepository = mock(CampaignRepository.class);
        clientRepository = mock(ClientRepository.class);
        zoneRepository = mock(CampaignZoneRepository.class);
        reservationRepository = mock(ReservationRepository.class);
        guard = mock(CampaignAccessGuard.class);
        mapper = mock(CampaignMapper.class);
        aiVerificationService = mock(AiVerificationService.class);
        Clock clock = Clock.fixed(TODAY.atTime(10, 0).atZone(TUNIS).toInstant(), TUNIS);
        CampaignReservationSync sync = new CampaignReservationSync(reservationRepository, campaignRepository);
        service = new CampaignService(campaignRepository, clientRepository, zoneRepository, reservationRepository,
                mock(MediaFileRepository.class), mock(PaymentSimulationRepository.class),
                mock(AiContentCheckRepository.class), mock(AiDecisionLogRepository.class), guard, mapper, sync,
                aiVerificationService, mock(FileStorageService.class), clock);

        client = Client.builder().id(5L).user(User.builder().id(10L).nom("Annonceur").build())
                .validationStatus(ClientValidationStatus.VALIDATED).build();
        TestAuth.login(10L, "ANNONCEUR");
        when(clientRepository.findByUserId(10L)).thenReturn(Optional.of(client));
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));
        when(reservationRepository.findByCampaignId(1L)).thenReturn(reservations);
        when(reservationRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(mapper.toResponse(any(Campaign.class))).thenAnswer(inv -> {
            Campaign c = inv.getArgument(0);
            return CampaignResponse.builder().id(c.getId()).status(c.getStatus().name()).build();
        });
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    private Campaign campaign(CampaignStatus status) {
        Campaign campaign = Campaign.builder()
                .id(1L).client(client).name("Collection automne").objective("Nouvelle collection")
                .budget(new BigDecimal("500.00"))
                .startDate(TODAY.plusDays(2)).endDate(TODAY.plusDays(20))
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(20, 0))
                .status(status)
                .build();
        when(guard.owned(1L)).thenReturn(campaign);
        return campaign;
    }

    private static Reservation reservation(long id, ReservationStatus status, LocalDate start, LocalDate end, long views) {
        return Reservation.builder().id(id).reservationStatus(status).startDate(start).endDate(end)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).estimatedViews(views).build();
    }

    private static void assertApiError(ThrowableAssert.ThrowingCallable call, HttpStatus status, String code) {
        assertThatThrownBy(call).isInstanceOf(ApiException.class).satisfies(ex -> {
            assertThat(((ApiException) ex).getStatus()).isEqualTo(status);
            assertThat(((ApiException) ex).getCode()).isEqualTo(code);
        });
    }

    @Test
    void submitListsEveryMissingElement() {
        Campaign campaign = campaign(CampaignStatus.BROUILLON);
        campaign.setStartDate(null);
        campaign.setStartTime(null);
        campaign.setBudget(BigDecimal.ZERO);
        when(zoneRepository.countByCampaignId(1L)).thenReturn(0L);
        reservations.add(reservation(1, ReservationStatus.TEMPORAIRE, TODAY.minusDays(5), TODAY.minusDays(1), 100));

        assertThatThrownBy(() -> service.submit(1L))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo("SUBMIT_INCOMPLETE");
                    assertThat(api.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(api.getErrors()).containsOnlyKeys("period", "times", "budget", "zones", "reservations");
                });
        verify(aiVerificationService, never()).runCheck(any(), anyBoolean());
        assertThat(campaign.getStatus()).isEqualTo(CampaignStatus.BROUILLON);
    }

    @Test
    void submitFlagsAnAlreadyFinishedPeriod() {
        Campaign campaign = campaign(CampaignStatus.BROUILLON);
        campaign.setStartDate(TODAY.minusDays(10));
        campaign.setEndDate(TODAY.minusDays(1));
        when(zoneRepository.countByCampaignId(1L)).thenReturn(1L);
        reservations.add(reservation(1, ReservationStatus.TEMPORAIRE, TODAY, TODAY.plusDays(1), 100));

        assertThat(service.submitCompleteness(campaign)).containsOnlyKeys("period");
    }

    @Test
    void submitMovesToPendingAndRunsTheAiInTheSameCall() {
        Campaign campaign = campaign(CampaignStatus.BROUILLON);
        when(zoneRepository.countByCampaignId(1L)).thenReturn(2L);
        reservations.add(reservation(1, ReservationStatus.TEMPORAIRE, TODAY.plusDays(2), TODAY.plusDays(5), 100));
        doAnswer(inv -> {
            Campaign c = inv.getArgument(0);
            assertThat(c.getStatus()).isEqualTo(CampaignStatus.PENDING_AI_CHECK);
            c.setStatus(CampaignStatus.APPROVED_BY_AI);
            c.setAiStatus(CampaignAiStatus.APPROVED);
            return null;
        }).when(aiVerificationService).runCheck(campaign, false);

        CampaignResponse response = service.submit(1L);

        assertThat(response.getStatus()).isEqualTo("APPROVED_BY_AI");
        assertThat(campaign.getSubmittedAt()).isEqualTo(TODAY.atTime(10, 0).atZone(TUNIS).toInstant());
        verify(aiVerificationService).runCheck(campaign, false);
    }

    @Test
    void submitRequiresADraftAndAnAllowedClient() {
        campaign(CampaignStatus.PENDING_AI_CHECK);
        assertApiError(() -> service.submit(1L), HttpStatus.CONFLICT, "CAMPAIGN_NOT_SUBMITTABLE");

        campaign(CampaignStatus.BROUILLON);
        client.setValidationStatus(ClientValidationStatus.SUSPENDED);
        assertApiError(() -> service.submit(1L), HttpStatus.FORBIDDEN, "CLIENT_NOT_ALLOWED");
    }

    @Test
    void createValidatesPeriodTimesAndPastStart() {
        CampaignRequest.CampaignRequestBuilder base = CampaignRequest.builder().name("Campagne").budget(BigDecimal.TEN);

        assertApiError(() -> service.create(base.startDate(TODAY.minusDays(1)).endDate(TODAY).build()),
                HttpStatus.BAD_REQUEST, "START_DATE_IN_PAST");
        assertApiError(() -> service.create(base.startDate(TODAY.plusDays(3)).endDate(TODAY.plusDays(1)).build()),
                HttpStatus.BAD_REQUEST, "INVALID_PERIOD");
        assertApiError(() -> service.create(base.startDate(TODAY).endDate(TODAY).startTime(LocalTime.NOON).build()),
                HttpStatus.BAD_REQUEST, "INVALID_TIME_RANGE");
        assertApiError(() -> service.create(base.startTime(LocalTime.NOON).endTime(LocalTime.of(11, 0)).build()),
                HttpStatus.BAD_REQUEST, "INVALID_TIME_RANGE");

        client.setValidationStatus(ClientValidationStatus.REJECTED);
        assertApiError(() -> service.create(CampaignRequest.builder().name("x").budget(BigDecimal.ONE).build()),
                HttpStatus.FORBIDDEN, "CLIENT_NOT_ALLOWED");
    }

    @Test
    void createStoresADraftForTheCurrentClient() {
        CampaignResponse response = service.create(CampaignRequest.builder().name("  Campagne  ").budget(BigDecimal.TEN)
                .startDate(TODAY).endDate(TODAY.plusDays(1)).startTime(LocalTime.of(7, 0)).endTime(LocalTime.of(12, 0))
                .build());
        assertThat(response.getStatus()).isEqualTo("BROUILLON");
        verify(campaignRepository).save(org.mockito.ArgumentMatchers.argThat(c ->
                c.getClient() == client && "Campagne".equals(c.getName())));
    }

    @Test
    void updateReopensARefusedCampaignAndCancelsReservationsOutsideTheNewWindow() {
        Campaign campaign = campaign(CampaignStatus.BLOCKED);
        campaign.setStartDate(TODAY.minusDays(3));
        campaign.setRejectionReason("Visuel non conforme");
        Reservation inside = reservation(1, ReservationStatus.TEMPORAIRE, TODAY, TODAY.plusDays(3), 300);
        Reservation outside = reservation(2, ReservationStatus.TEMPORAIRE, TODAY.plusDays(8), TODAY.plusDays(12), 500);
        Reservation cancelled = reservation(3, ReservationStatus.ANNULEE, TODAY, TODAY.plusDays(1), 900);
        reservations.addAll(List.of(inside, outside, cancelled));

        service.update(1L, CampaignRequest.builder().name("Collection v2").budget(new BigDecimal("600"))
                .startDate(TODAY.minusDays(3)) // unchanged: a past start date is accepted
                .endDate(TODAY.plusDays(5)).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(20, 0)).build());

        assertThat(campaign.getStatus()).isEqualTo(CampaignStatus.BROUILLON);
        assertThat(campaign.getRejectionReason()).isEqualTo("Visuel non conforme");
        assertThat(campaign.getName()).isEqualTo("Collection v2");
        assertThat(inside.getReservationStatus()).isEqualTo(ReservationStatus.TEMPORAIRE);
        assertThat(outside.getReservationStatus()).isEqualTo(ReservationStatus.ANNULEE);
        assertThat(campaign.getEstimatedViews()).isEqualTo(300L);
    }

    @Test
    void updateAndDeleteAreRefusedDuringReview() {
        campaign(CampaignStatus.REVIEW_REQUIRED);
        CampaignRequest request = CampaignRequest.builder().name("x").budget(BigDecimal.ONE).build();
        assertApiError(() -> service.update(1L, request), HttpStatus.CONFLICT, "CAMPAIGN_NOT_EDITABLE");
        assertApiError(() -> service.delete(1L), HttpStatus.CONFLICT, "CAMPAIGN_NOT_EDITABLE");
        assertApiError(() -> service.reopen(1L), HttpStatus.CONFLICT, "CAMPAIGN_NOT_EDITABLE");
    }

    @Test
    void reopenRejectedByAi() {
        Campaign campaign = campaign(CampaignStatus.REJECTED_BY_AI);
        campaign.setAiStatus(CampaignAiStatus.REJECTED);
        campaign.setSubmittedAt(Instant.now());

        assertThat(service.reopen(1L).getStatus()).isEqualTo("BROUILLON");
        assertThat(campaign.getAiStatus()).isNull();
    }
}
