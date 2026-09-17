package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportAvailability;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.SupportAvailabilityRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DiffusionServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate D = LocalDate.of(2026, 10, 5);
    private static final LocalDateTime AT = D.atTime(19, 30);

    private final Zone zone = Zone.builder().id(1L).name("Tunis Centre").build();
    private final Zone otherZone = Zone.builder().id(2L).name("La Marsa").build();
    private DiffusionSupport support;

    private DiffusionSupportRepository supportRepository;
    private ReservationRepository reservationRepository;
    private EmergencyMessageRepository emergencyRepository;
    private MediaFileRepository mediaRepository;
    private DiffusionLogRepository logRepository;
    private SupportAvailabilityRepository blockRepository;
    private CampaignZoneRepository campaignZoneRepository;
    private CampaignRepository campaignRepository;
    private PaymentSimulationRepository paymentRepository;
    private AiContentCheckRepository checkRepository;
    private TpubProperties properties;
    private DiffusionService service;

    @BeforeEach
    void setUp() {
        support = DiffusionSupport.builder().id(7L).name("Écran").zone(zone).supportType(SupportType.ECRAN)
                .latitude(new BigDecimal("36.8000")).longitude(new BigDecimal("10.1800"))
                .technicalStatus(TechnicalStatus.ACTIF).diffusionCapacity((short) 1).build();
        supportRepository = mock(DiffusionSupportRepository.class);
        reservationRepository = mock(ReservationRepository.class);
        emergencyRepository = mock(EmergencyMessageRepository.class);
        mediaRepository = mock(MediaFileRepository.class);
        logRepository = mock(DiffusionLogRepository.class);
        blockRepository = mock(SupportAvailabilityRepository.class);
        campaignZoneRepository = mock(CampaignZoneRepository.class);
        campaignRepository = mock(CampaignRepository.class);
        paymentRepository = mock(PaymentSimulationRepository.class);
        checkRepository = mock(AiContentCheckRepository.class);
        properties = new TpubProperties();
        properties.getMedia().setBaseUrl("/uploads");
        FileStorageService storage = new FileStorageService(properties);
        EstimationService estimation = new EstimationService(properties, supportRepository, reservationRepository,
                mock(CampaignAccessGuard.class));
        service = new DiffusionService(supportRepository, reservationRepository, emergencyRepository, mediaRepository,
                logRepository, blockRepository, campaignZoneRepository, campaignRepository, paymentRepository,
                checkRepository, estimation, storage, properties,
                Clock.fixed(AT.atZone(TUNIS).toInstant(), TUNIS));
        when(supportRepository.findById(7L)).thenReturn(Optional.of(support));
        when(logRepository.save(any(DiffusionLog.class))).thenAnswer(inv -> {
            DiffusionLog log = inv.getArgument(0);
            log.setId(100L);
            return log;
        });
        when(checkRepository.findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(anyLong())).thenReturn(Optional.empty());
        when(paymentRepository.findTopByCampaignIdOrderByCreatedAtDescIdDesc(anyLong())).thenReturn(Optional.empty());
    }

    private Campaign campaign(long id, int priority) {
        User user = User.builder().id(50L + id).isActive(true).build();
        return Campaign.builder().id(id).name("Campagne " + id)
                .client(Client.builder().id(id).user(user).validationStatus(ClientValidationStatus.VALIDATED).build())
                .status(CampaignStatus.ACTIVE).aiStatus(CampaignAiStatus.APPROVED).adminStatus(CampaignAdminStatus.VALIDATED)
                .aiOverride(false).budget(new BigDecimal("100")).consumedBudget(BigDecimal.ZERO)
                .startDate(D.minusDays(1)).endDate(D.plusDays(3)).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(22, 0))
                .priorityScore((short) priority).build();
    }

    private Reservation reservation(long id, Campaign campaign) {
        return Reservation.builder().id(id).campaign(campaign).support(support).zone(zone)
                .startDate(D).endDate(D).startTime(LocalTime.of(18, 0)).endTime(LocalTime.of(22, 0))
                .reservationStatus(ReservationStatus.CONFIRMEE).build();
    }

    private void target(Campaign... campaigns) {
        for (Campaign c : campaigns) {
            when(campaignZoneRepository.findByCampaignId(c.getId())).thenReturn(List.of(CampaignZone.builder()
                    .latitude(new BigDecimal("36.8000")).longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("1")).build()));
        }
    }

    private static EmergencyMessage emergency(long id, UrgencyLevel level, int priority, Zone zone) {
        return EmergencyMessage.builder().id(id).title("Alerte " + id).content("Contenu " + id).zone(zone)
                .startDate(D).endDate(D).startTime(LocalTime.of(19, 0)).endTime(LocalTime.of(20, 0))
                .urgencyLevel(level).priority((short) priority).isActive(true)
                .createdAt(Instant.parse("2026-10-01T10:00:00Z").plusSeconds(id)).build();
    }

    // --- pure rules ------------------------------------------------------------------------------------------------

    @Test
    void emergencySelectionUsesWindowTargetAndUrgencyRanking() {
        EmergencyMessage high = emergency(1, UrgencyLevel.HIGH, 1, zone);
        EmergencyMessage critical = emergency(2, UrgencyLevel.CRITICAL, 5, zone);
        EmergencyMessage otherZone = emergency(3, UrgencyLevel.CRITICAL, 1, this.otherZone);
        EmergencyMessage circle = emergency(4, UrgencyLevel.CRITICAL, 1, this.otherZone);
        circle.setLatitude(new BigDecimal("36.8010"));
        circle.setLongitude(new BigDecimal("10.1800"));
        circle.setRadiusKm(new BigDecimal("0.5"));
        EmergencyMessage later = emergency(5, UrgencyLevel.CRITICAL, 1, zone);
        later.setStartTime(LocalTime.of(20, 0));
        later.setEndTime(LocalTime.of(21, 0));

        assertThat(DiffusionService.selectEmergency(List.of(high, critical, otherZone, later), support, AT)).contains(critical);
        // same urgency: lower priority number wins
        assertThat(DiffusionService.selectEmergency(List.of(high, critical, circle), support, AT)).contains(circle);
        // same urgency and priority: newest first
        EmergencyMessage twin = emergency(6, UrgencyLevel.CRITICAL, 1, zone);
        assertThat(DiffusionService.selectEmergency(List.of(circle, twin), support, AT)).contains(twin);
        assertThat(DiffusionService.selectEmergency(List.of(otherZone, later), support, AT)).isEmpty();
        // default times: whole days
        EmergencyMessage allDay = emergency(7, UrgencyLevel.LOW, 1, zone);
        allDay.setStartTime(null);
        allDay.setEndTime(null);
        assertThat(DiffusionService.selectEmergency(List.of(allDay), support, D.atTime(23, 59, 59))).contains(allDay);
        assertThat(DiffusionService.selectEmergency(List.of(allDay), support, D.plusDays(1).atStartOfDay())).isEmpty();
    }

    @Test
    void supportGateHonoursTechnicalStatusAndBlocks() {
        SupportAvailability block = SupportAvailability.builder().availabilityDate(D).startTime(LocalTime.of(19, 0))
                .endTime(LocalTime.of(19, 30)).availabilityStatus(AvailabilityStatus.MAINTENANCE).build();
        assertThat(DiffusionService.supportOpen(support, List.of(block), LocalTime.of(19, 29, 59))).isFalse();
        assertThat(DiffusionService.supportOpen(support, List.of(block), LocalTime.of(19, 30))).isTrue();
        support.setTechnicalStatus(TechnicalStatus.MAINTENANCE);
        assertThat(DiffusionService.supportOpen(support, List.of(), LocalTime.NOON)).isFalse();
    }

    @Test
    void campaignGatesIncludingOverrideAndBudget() {
        BigDecimal unit = new BigDecimal("0.0080");
        LocalTime t = LocalTime.of(19, 30);
        assertThat(DiffusionService.isCampaignEligible(campaign(1, 5), D, t, unit)).isTrue();

        Campaign review = campaign(1, 5);
        review.setAiStatus(CampaignAiStatus.REVIEW_REQUIRED);
        assertThat(DiffusionService.isCampaignEligible(review, D, t, unit)).isFalse();
        review.setAiOverride(true);
        assertThat(DiffusionService.isCampaignEligible(review, D, t, unit)).isTrue();

        Campaign notValidated = campaign(1, 5);
        notValidated.setAdminStatus(CampaignAdminStatus.PENDING);
        assertThat(DiffusionService.isCampaignEligible(notValidated, D, t, unit)).isFalse();

        Campaign blocked = campaign(1, 5);
        blocked.setStatus(CampaignStatus.BLOCKED);
        assertThat(DiffusionService.isCampaignEligible(blocked, D, t, unit)).isFalse();

        assertThat(DiffusionService.isCampaignEligible(campaign(1, 5), D, LocalTime.of(22, 0), unit)).isFalse();
        assertThat(DiffusionService.isCampaignEligible(campaign(1, 5), D.plusDays(4), t, unit)).isFalse();

        Campaign exhausted = campaign(1, 5);
        exhausted.setConsumedBudget(new BigDecimal("99.9921"));
        assertThat(DiffusionService.isCampaignEligible(exhausted, D, t, unit)).isFalse();
        exhausted.setConsumedBudget(new BigDecimal("99.9920"));
        assertThat(DiffusionService.isCampaignEligible(exhausted, D, t, unit)).isTrue();

        Campaign suspended = campaign(1, 5);
        suspended.getClient().setValidationStatus(ClientValidationStatus.SUSPENDED);
        assertThat(DiffusionService.isCampaignEligible(suspended, D, t, unit)).isFalse();
        Campaign inactiveUser = campaign(1, 5);
        inactiveUser.getClient().getUser().setIsActive(false);
        assertThat(DiffusionService.isCampaignEligible(inactiveUser, D, t, unit)).isFalse();
    }

    @Test
    void scoreAndEquitableRotation() {
        assertThat(DiffusionService.score((short) 6, 83)).isEqualTo(77);
        assertThat(DiffusionService.score((short) 10, 100)).isEqualTo(120);
        assertThat(DiffusionService.score((short) 0, null)).isZero();

        Instant old = Instant.parse("2026-10-05T10:00:00Z");
        Instant recent = Instant.parse("2026-10-05T17:00:00Z");
        DiffusionService.Candidate top = new DiffusionService.Candidate(campaign(3, 5), null, 70, recent);
        DiffusionService.Candidate close = new DiffusionService.Candidate(campaign(2, 5), null, 66, old);
        DiffusionService.Candidate low = new DiffusionService.Candidate(campaign(1, 1), null, 20, null);
        // low never diffused but is outside the pool (score < 70 − 5)
        assertThat(DiffusionService.pick(List.of(top, close, low))).contains(close);
        DiffusionService.Candidate never = new DiffusionService.Candidate(campaign(4, 5), null, 65, null);
        assertThat(DiffusionService.pick(List.of(top, close, never))).contains(never);
        DiffusionService.Candidate tieA = new DiffusionService.Candidate(campaign(9, 5), null, 50, null);
        DiffusionService.Candidate tieB = new DiffusionService.Candidate(campaign(8, 5), null, 50, null);
        assertThat(DiffusionService.pick(List.of(tieA, tieB))).contains(tieB);
        assertThat(DiffusionService.pick(List.of())).isEmpty();
    }

    // --- engine with mocked repositories ----------------------------------------------------------------------------

    @Test
    void missingSupportIdAndZoneMismatch() {
        assertThatThrownBy(() -> service.getNextAd(null, null, AT))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MISSING_PARAMETER");
        assertThatThrownBy(() -> service.getNextAd(7L, "La Marsa", AT))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUPPORT_ZONE_MISMATCH");
        when(supportRepository.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getNextAd(99L, null, AT))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUPPORT_NOT_FOUND");
    }

    @Test
    void emergencyTakesOverEvenOnInactiveSupport() {
        support.setTechnicalStatus(TechnicalStatus.HORS_LIGNE);
        EmergencyMessage message = emergency(1, UrgencyLevel.HIGH, 2, zone);
        message.setDurationSeconds((short) 30);
        when(emergencyRepository.findActiveOnDate(D)).thenReturn(List.of(message));

        DiffusionResponse response = service.getNextAd(7L, "tunis centre", AT);

        assertThat(response.getType()).isEqualTo("urgence");
        assertThat(response.getContent()).isEqualTo("Contenu 1");
        assertThat(response.getUrgencyLevel()).isEqualTo("HIGH");
        assertThat(response.getDuration()).isEqualTo(30);
        assertThat(response.getDatetime()).isEqualTo("2026-10-05T19:30:00");
        ArgumentCaptor<DiffusionLog> log = ArgumentCaptor.forClass(DiffusionLog.class);
        verify(logRepository).save(log.capture());
        assertThat(log.getValue().getContentType()).isEqualTo(DiffusionContentType.URGENCE);
        assertThat(log.getValue().getCost()).isEqualByComparingTo("0");
        assertThat(log.getValue().getDiffusedAt()).isEqualTo(AT.atZone(TUNIS).toInstant());
    }

    @Test
    void frequencyCapFallsBackToDefaultContent() {
        properties.getDiffusion().setMaxPerHour(2);
        Campaign c = campaign(1, 5);
        target(c);
        when(reservationRepository.findActiveReservationsForSupportAt(7L, D, AT.toLocalTime(), ReservationStatus.CONFIRMEE))
                .thenReturn(List.of(reservation(11, c)));
        when(logRepository.countInWindow(eq(DiffusionContentType.PUBLICITE), eq(1L), eq(7L), any(), any())).thenReturn(2L);

        DiffusionResponse response = service.getNextAd(7L, null, AT);

        assertThat(response.getType()).isEqualTo("defaut");
        assertThat(response.getTitle()).isEqualTo("TPUB — Tukhnanutha");
        assertThat(response.getContent()).isEqualTo("Espace de diffusion TPUB");
        assertThat(response.getMediaUrl()).isNull();
        verify(campaignRepository, never()).save(any());
    }

    @Test
    void supportOutsideCampaignCircleIsNotDiffused() {
        Campaign c = campaign(1, 5);
        when(campaignZoneRepository.findByCampaignId(1L)).thenReturn(List.of(CampaignZone.builder()
                .latitude(new BigDecimal("36.9000")).longitude(new BigDecimal("10.3000")).radiusKm(new BigDecimal("1")).build()));
        when(reservationRepository.findActiveReservationsForSupportAt(7L, D, AT.toLocalTime(), ReservationStatus.CONFIRMEE))
                .thenReturn(List.of(reservation(11, c)));
        assertThat(service.getNextAd(7L, null, AT).getType()).isEqualTo("defaut");
    }

    @Test
    void adIsSelectedWithMediaAndBudgetIsConsumed() {
        Campaign rotated = campaign(1, 6);
        Campaign fresh = campaign(2, 6);
        target(rotated, fresh);
        when(reservationRepository.findActiveReservationsForSupportAt(7L, D, AT.toLocalTime(), ReservationStatus.CONFIRMEE))
                .thenReturn(List.of(reservation(12, fresh), reservation(11, rotated), reservation(13, fresh)));
        when(logRepository.findLastDiffusion(DiffusionContentType.PUBLICITE, 1L, 7L)).thenReturn(Instant.parse("2026-10-05T16:00:00Z"));
        when(logRepository.findLastDiffusion(DiffusionContentType.PUBLICITE, 2L, 7L)).thenReturn(Instant.parse("2026-10-05T15:00:00Z"));
        when(mediaRepository.findByCampaignIdOrderBySortOrderAscIdAsc(2L)).thenReturn(List.of(
                MediaFile.builder().id(5L).filePath("campaigns/2/clip.mp4").fileType(MediaFileType.VIDEO).durationSeconds((short) 20).build()));
        PaymentSimulation payment = PaymentSimulation.builder().id(1L).budgetConsumed(new BigDecimal("1.0000")).build();
        when(paymentRepository.findTopByCampaignIdOrderByCreatedAtDescIdDesc(2L)).thenReturn(Optional.of(payment));

        DiffusionResponse response = service.getNextAd(7L, null, AT);

        assertThat(response.getType()).isEqualTo("publicite");
        assertThat(response.getCampaignId()).isEqualTo(2L);
        assertThat(response.getMediaUrl()).isEqualTo("/uploads/campaigns/2/clip.mp4");
        assertThat(response.getMediaType()).isEqualTo("VIDEO");
        assertThat(response.getDuration()).isEqualTo(20);
        assertThat(response.getPriority()).isEqualTo(60);
        assertThat(response.getDiffusionLogId()).isEqualTo(100L);
        assertThat(fresh.getConsumedBudget()).isEqualByComparingTo("0.0080");
        assertThat(payment.getBudgetConsumed()).isEqualByComparingTo("1.0080");
        ArgumentCaptor<DiffusionLog> log = ArgumentCaptor.forClass(DiffusionLog.class);
        verify(logRepository).save(log.capture());
        assertThat(log.getValue().getReservation().getId()).isEqualTo(12L);
        assertThat(log.getValue().getCost()).isEqualByComparingTo("0.0080");
        assertThat(log.getValue().getPriority()).isEqualTo((short) 60);
    }
}
