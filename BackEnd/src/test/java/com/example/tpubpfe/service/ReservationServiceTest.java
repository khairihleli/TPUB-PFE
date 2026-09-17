package com.example.tpubpfe.service;

import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReservationServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);

    private ReservationRepository reservationRepository;
    private CampaignZoneRepository campaignZoneRepository;
    private AvailabilityService availabilityService;
    private ReservationService service;

    @BeforeEach
    void setUp() {
        reservationRepository = mock(ReservationRepository.class);
        campaignZoneRepository = mock(CampaignZoneRepository.class);
        availabilityService = mock(AvailabilityService.class);
        service = new ReservationService(reservationRepository, mock(DiffusionSupportRepository.class),
                campaignZoneRepository, mock(ClientRepository.class), mock(CampaignAccessGuard.class),
                mock(CampaignReservationSync.class), availabilityService, mock(EstimationService.class),
                mock(AuditService.class), Clock.fixed(TODAY.atTime(9, 0).atZone(TUNIS).toInstant(), TUNIS));
    }

    private static Campaign campaign(CampaignStatus status) {
        User owner = User.builder().id(5L).build();
        return Campaign.builder().id(10L).name("C").status(status)
                .client(Client.builder().id(3L).user(owner).validationStatus(ClientValidationStatus.VALIDATED).build())
                .startDate(TODAY.plusDays(1)).endDate(TODAY.plusDays(10))
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(22, 0)).build();
    }

    private static DiffusionSupport support(String lat, String lng) {
        return DiffusionSupport.builder().id(7L).name("P").supportType(SupportType.ECRAN)
                .latitude(new BigDecimal(lat)).longitude(new BigDecimal(lng))
                .technicalStatus(TechnicalStatus.ACTIF).diffusionCapacity((short) 1).build();
    }

    private static CampaignZone circle() {
        return CampaignZone.builder().latitude(new BigDecimal("36.8000")).longitude(new BigDecimal("10.1800"))
                .radiusKm(new BigDecimal("2.0")).build();
    }

    private static Reservation reservation(long id, Campaign campaign, ReservationStatus status, LocalDate start,
                                           LocalDate end, int fromHour, int toHour) {
        return Reservation.builder().id(id).campaign(campaign).startDate(start).endDate(end)
                .startTime(LocalTime.of(fromHour, 0)).endTime(LocalTime.of(toHour, 0)).reservationStatus(status).build();
    }

    private static String code(Runnable call) {
        try {
            call.run();
        } catch (ApiException ex) {
            return ex.getCode();
        }
        return null;
    }

    @Test
    void campaignLevelChecksFollowTheContractOrder() {
        assertThat(code(() -> service.checkCampaign(campaign(CampaignStatus.REVIEW_REQUIRED), null, null, null, null)))
                .isEqualTo("CAMPAIGN_NOT_RESERVABLE");

        Campaign suspended = campaign(CampaignStatus.BROUILLON);
        suspended.getClient().setValidationStatus(ClientValidationStatus.SUSPENDED);
        assertThat(code(() -> service.checkCampaign(suspended, null, null, null, null))).isEqualTo("CLIENT_NOT_ALLOWED");

        Campaign noTimes = campaign(CampaignStatus.BROUILLON);
        noTimes.setStartTime(null);
        noTimes.setEndTime(null);
        assertThatThrownBy(() -> service.checkCampaign(noTimes, null, null, null, null))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    assertThat(((ApiException) ex).getCode()).isEqualTo("VALIDATION_FAILED");
                    assertThat(((ApiException) ex).getErrors()).containsOnlyKeys("startTime", "endTime");
                });

        Campaign draft = campaign(CampaignStatus.BROUILLON);
        assertThat(code(() -> service.checkCampaign(draft, TODAY.minusDays(1), TODAY.plusDays(2), null, null)))
                .isEqualTo("START_DATE_IN_PAST");
        assertThat(code(() -> service.checkCampaign(draft, TODAY.plusDays(2), TODAY.plusDays(11), null, null)))
                .isEqualTo("RESERVATION_OUTSIDE_CAMPAIGN_PERIOD");
        assertThat(code(() -> service.checkCampaign(draft, null, null, LocalTime.of(7, 0), LocalTime.of(12, 0))))
                .isEqualTo("RESERVATION_OUTSIDE_CAMPAIGN_PERIOD");

        when(campaignZoneRepository.countByCampaignId(10L)).thenReturn(0L);
        assertThat(code(() -> service.checkCampaign(draft, null, null, LocalTime.of(18, 0), LocalTime.of(22, 0))))
                .isEqualTo("CAMPAIGN_ZONE_REQUIRED");

        when(campaignZoneRepository.countByCampaignId(10L)).thenReturn(1L);
        TimeWindow window = service.checkCampaign(draft, null, null, LocalTime.of(18, 0), LocalTime.of(22, 0));
        assertThat(window).isEqualTo(new TimeWindow(TODAY.plusDays(1), TODAY.plusDays(10), LocalTime.of(18, 0), LocalTime.of(22, 0)));
    }

    @Test
    void supportLevelChecksZoneDuplicateAndStatus() {
        Campaign draft = campaign(CampaignStatus.BROUILLON);
        TimeWindow window = new TimeWindow(TODAY.plusDays(1), TODAY.plusDays(3), LocalTime.of(18, 0), LocalTime.of(22, 0));
        DiffusionSupport inside = support("36.8050", "10.1800");

        assertThat(service.supportRefusal(draft, support("36.9000", "10.3000"), window, List.of(circle())))
                .isEqualTo("SUPPORT_OUTSIDE_CAMPAIGN_ZONE");

        when(reservationRepository.findBookedPeriodsForSupport(eq(7L), any(), any(), any()))
                .thenReturn(List.of(reservation(1, draft, ReservationStatus.TEMPORAIRE, TODAY.plusDays(2), TODAY.plusDays(2), 20, 21)));
        assertThat(service.supportRefusal(draft, inside, window, List.of(circle()))).isEqualTo("RESERVATION_DUPLICATE");

        when(reservationRepository.findBookedPeriodsForSupport(anyLong(), any(), any(), any())).thenReturn(List.of());
        when(availabilityService.deriveOne(any(), any(), eq(10L)))
                .thenReturn(new AvailabilityRules.Result(AvailabilityStatus.MAINTENANCE, 0, List.of(), List.of()));
        assertThat(service.supportRefusal(draft, inside, window, List.of(circle()))).isEqualTo("SUPPORT_UNAVAILABLE");
        when(availabilityService.deriveOne(any(), any(), eq(10L)))
                .thenReturn(new AvailabilityRules.Result(AvailabilityStatus.OCCUPE, 0, List.of(), List.of()));
        assertThat(service.supportRefusal(draft, inside, window, List.of(circle()))).isEqualTo("SUPPORT_ALREADY_RESERVED");
        when(availabilityService.deriveOne(any(), any(), eq(10L)))
                .thenReturn(new AvailabilityRules.Result(AvailabilityStatus.DISPONIBLE, 1, List.of(), List.of()));
        assertThat(service.supportRefusal(draft, inside, window, List.of(circle()))).isNull();
    }

    @Test
    void conflictsDetectOverAndFullBookingOnTimeOverlapOnly() {
        Campaign a = Campaign.builder().id(1L).build();
        Campaign b = Campaign.builder().id(2L).build();
        Campaign c = Campaign.builder().id(3L).build();
        Reservation r1 = reservation(1, a, ReservationStatus.CONFIRMEE, TODAY, TODAY.plusDays(5), 8, 12);
        Reservation r2 = reservation(2, b, ReservationStatus.TEMPORAIRE, TODAY.plusDays(2), TODAY.plusDays(8), 10, 14);
        Reservation afternoon = reservation(3, c, ReservationStatus.TEMPORAIRE, TODAY, TODAY.plusDays(5), 12, 18);
        Reservation cancelled = reservation(4, c, ReservationStatus.ANNULEE, TODAY, TODAY.plusDays(5), 8, 12);

        List<ReservationService.ConflictSet> capacityOne = ReservationService.detectConflicts(
                List.of(r1, r2, afternoon, cancelled), 1);
        // S(r1) = {r1, r2}; S(r2) = {r1, r2, afternoon}; S(afternoon) = {r2, afternoon}: r1 and afternoon only touch
        // at 12:00, which is not an overlap. The cancelled reservation never counts.
        assertThat(capacityOne).hasSize(3).allSatisfy(set -> assertThat(set.severity()).isEqualTo("CONFLIT"));
        ReservationService.ConflictSet first = capacityOne.get(0);
        assertThat(first.reservations()).extracting(Reservation::getId).containsExactly(1L, 2L);
        assertThat(first.overlap()).isEqualTo(new TimeWindow(TODAY.plusDays(2), TODAY.plusDays(5), LocalTime.of(10, 0), LocalTime.of(12, 0)));
        assertThat(capacityOne.get(1).reservations()).extracting(Reservation::getId).containsExactly(1L, 2L, 3L);
        assertThat(capacityOne.get(2).overlap())
                .isEqualTo(new TimeWindow(TODAY.plusDays(2), TODAY.plusDays(5), LocalTime.of(12, 0), LocalTime.of(14, 0)));

        // Same sets found twice are reported once
        Reservation twin = reservation(5, c, ReservationStatus.CONFIRMEE, TODAY, TODAY, 8, 9);
        Reservation twin2 = reservation(6, b, ReservationStatus.CONFIRMEE, TODAY, TODAY, 8, 9);
        assertThat(ReservationService.detectConflicts(List.of(twin, twin2), 1)).hasSize(1);

        List<ReservationService.ConflictSet> capacityTwo = ReservationService.detectConflicts(List.of(r1, r2, afternoon), 2);
        // r2 overlaps both r1 and afternoon → |S| = 3 > 2 (CONFLIT) with an empty common intersection → r2's window
        assertThat(capacityTwo).extracting(ReservationService.ConflictSet::severity).containsExactly("SATURE", "CONFLIT", "SATURE");
        ReservationService.ConflictSet conflict = capacityTwo.get(1);
        assertThat(conflict.overlap()).isEqualTo(TimeWindow.of(r2));

        assertThat(ReservationService.detectConflicts(List.of(r1, afternoon), 1)).isEmpty();
    }

    @Test
    void cancellableRulesPerRole() {
        Campaign draft = campaign(CampaignStatus.BROUILLON);
        Campaign rejected = campaign(CampaignStatus.REJECTED_BY_AI);
        Campaign active = campaign(CampaignStatus.ACTIVE);
        UserDetailsImpl owner = new UserDetailsImpl(5L, "o@t", "x", "O", "ANNONCEUR", true);
        UserDetailsImpl stranger = new UserDetailsImpl(6L, "s@t", "x", "S", "ANNONCEUR", true);
        UserDetailsImpl admin = new UserDetailsImpl(1L, "a@t", "x", "A", "ADMINISTRATEUR", true);
        UserDetailsImpl supervisor = new UserDetailsImpl(2L, "v@t", "x", "V", "SUPERVISEUR", true);

        Reservation temporary = reservation(1, draft, ReservationStatus.TEMPORAIRE, TODAY, TODAY, 8, 9);
        assertThat(ReservationService.isCancellable(temporary, owner)).isTrue();
        assertThat(ReservationService.isCancellable(temporary, stranger)).isFalse();
        assertThat(ReservationService.isCancellable(temporary, supervisor)).isFalse();
        assertThat(ReservationService.isCancellable(reservation(2, rejected, ReservationStatus.TEMPORAIRE, TODAY, TODAY, 8, 9), owner)).isTrue();
        assertThat(ReservationService.isCancellable(reservation(3, active, ReservationStatus.CONFIRMEE, TODAY, TODAY, 8, 9), owner)).isFalse();
        assertThat(ReservationService.isCancellable(reservation(3, active, ReservationStatus.CONFIRMEE, TODAY, TODAY, 8, 9), admin)).isTrue();
        assertThat(ReservationService.isCancellable(reservation(4, active, ReservationStatus.EXPIREE, TODAY, TODAY, 8, 9), admin)).isFalse();
        assertThat(ReservationService.isCancellable(temporary, null)).isFalse();
    }
}
