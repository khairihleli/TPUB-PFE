package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.GeoPricingProperties;
import com.example.zelqanepfe.dto.DemandHeatmapResponse;
import com.example.zelqanepfe.dto.HeatmapResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.DiffusionContentType;
import com.example.zelqanepfe.model.DiffusionInteraction;
import com.example.zelqanepfe.model.DiffusionLog;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.InteractionType;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.model.ZoneGeometryType;
import com.example.zelqanepfe.repository.CampaignZoneRepository;
import com.example.zelqanepfe.repository.DiffusionInteractionRepository;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HeatmapServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);

    private final Zone centre = Zone.builder().id(1L).name("Tunis Centre").isActive(true).build();
    private final Zone marsa = Zone.builder().id(2L).name("La Marsa").isActive(true).build();
    private final DiffusionSupport screen = support(1L, centre, 2);
    private final DiffusionSupport panel = support(2L, marsa, 1);
    private DiffusionLogRepository logRepository;
    private DiffusionInteractionRepository interactionRepository;
    private ReservationRepository reservationRepository;
    private CampaignZoneRepository campaignZoneRepository;
    private SupportAvailabilityRepository blockRepository;
    private HeatmapService service;

    private static DiffusionSupport support(long id, Zone zone, int capacity) {
        return DiffusionSupport.builder().id(id).name("P" + id).zone(zone).technicalStatus(TechnicalStatus.ACTIF)
                .diffusionCapacity((short) capacity).latitude(new BigDecimal("36.80")).longitude(new BigDecimal("10.18"))
                .build();
    }

    private static Reservation reservation(DiffusionSupport support, LocalDate start, LocalDate end, int startHour,
                                           int endHour) {
        return Reservation.builder().support(support).campaign(Campaign.builder().id(9L).build())
                .reservationStatus(ReservationStatus.CONFIRMEE).startDate(start).endDate(end)
                .startTime(LocalTime.of(startHour, 0)).endTime(LocalTime.of(endHour, 0)).build();
    }

    @BeforeEach
    void setUp() {
        logRepository = mock(DiffusionLogRepository.class);
        interactionRepository = mock(DiffusionInteractionRepository.class);
        reservationRepository = mock(ReservationRepository.class);
        campaignZoneRepository = mock(CampaignZoneRepository.class);
        blockRepository = mock(SupportAvailabilityRepository.class);
        DiffusionSupportRepository supportRepository = mock(DiffusionSupportRepository.class);
        ZoneRepository zoneRepository = mock(ZoneRepository.class);
        service = new HeatmapService(logRepository, interactionRepository, supportRepository, reservationRepository,
                blockRepository, campaignZoneRepository, zoneRepository, new GeoPricingProperties.Geo(),
                Clock.fixed(TODAY.atTime(12, 0).atZone(TUNIS).toInstant(), TUNIS));
        when(supportRepository.findAll()).thenReturn(List.of(panel, screen));
        when(supportRepository.findByZoneId(1L)).thenReturn(List.of(screen));
        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of(centre, marsa));
        when(blockRepository.findByAvailabilityDateBetween(any(), any())).thenReturn(List.of());
    }

    @Test
    void slotHoursAndCapacity() {
        Reservation r = reservation(screen, TODAY.minusDays(2), TODAY.plusDays(1), 18, 21);
        // clipped to [TODAY, TODAY+5]: 2 days × 3 h
        assertThat(HeatmapService.slotHours(r, TODAY, TODAY.plusDays(5))).isEqualTo(6.0);
        assertThat(HeatmapService.slotHours(r, TODAY.plusDays(2), TODAY.plusDays(5))).isZero();
        assertThat(HeatmapService.capacityHours(screen, 10)).isEqualTo(320.0);
        assertThat(HeatmapService.occupancy(400, 320)).isEqualTo(1.0);
        assertThat(HeatmapService.occupancy(1, 0)).isZero();
    }

    @Test
    void rangeValidation() {
        assertThatThrownBy(() -> service.demand(TODAY, TODAY.minusDays(1), null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");
        assertThatThrownBy(() -> service.demand(TODAY, TODAY.plusDays(366), null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");
        assertThatThrownBy(() -> service.demandPublic(TODAY, TODAY, LocalTime.of(20, 0), LocalTime.of(8, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_TIME_RANGE");
    }

    @Test
    void diffusionsWeightIsTheLogCountWithClicks() {
        when(logRepository.countPerSupportBetween(eq(Set.of(DiffusionContentType.PUBLICITE)), any(), any()))
                .thenReturn(List.<Object[]>of(new Object[]{1L, 12L}));
        DiffusionLog ad = DiffusionLog.builder().contentType(DiffusionContentType.PUBLICITE).build();
        DiffusionLog emergency = DiffusionLog.builder().contentType(DiffusionContentType.URGENCE).build();
        when(interactionRepository.findByLogDiffusedBetween(any(Instant.class), any(Instant.class))).thenReturn(List.of(
                DiffusionInteraction.builder().diffusionLog(ad).support(screen).interactionType(InteractionType.CLIC).build(),
                DiffusionInteraction.builder().diffusionLog(emergency).support(screen).interactionType(InteractionType.CLIC).build(),
                DiffusionInteraction.builder().diffusionLog(ad).support(screen).interactionType(InteractionType.INTERACTION).build()));

        HeatmapResponse response = service.diffusions(null, null, List.of(), null);

        assertThat(response.getFrom()).isEqualTo(TODAY.minusDays(29));
        assertThat(response.getTo()).isEqualTo(TODAY);
        assertThat(response.getPoints().getFeatures()).singleElement().satisfies(feature -> {
            assertThat(feature.getGeometry().getCoordinates()).containsExactly(10.18, 36.80);
            assertThat(feature.getProperties()).containsEntry("weight", 12L).containsEntry("clicks", 1L)
                    .containsEntry("zoneName", "Tunis Centre");
        });
        assertThat(response.getMaxWeight()).isEqualTo(12.0);
    }

    @Test
    void demandAggregatesSlotHoursTargetsAndZones() {
        when(reservationRepository.findByStatusesOverlappingDates(any(), eq(TODAY), eq(TODAY.plusDays(9)))).thenReturn(List.of(
                reservation(screen, TODAY, TODAY.plusDays(3), 8, 12),
                reservation(screen, TODAY.plusDays(9), TODAY.plusDays(20), 20, 22)));
        CampaignZone polygon = CampaignZone.builder().id(70L).zone(centre).campaign(Campaign.builder().id(9L)
                        .status(CampaignStatus.ACTIVE).build())
                .geometryType(ZoneGeometryType.POLYGONE).latitude(new BigDecimal("36.8")).longitude(new BigDecimal("10.18"))
                .build();
        when(campaignZoneRepository.findTargetsOverlapping(CampaignStatus.BROUILLON, TODAY, TODAY.plusDays(9)))
                .thenReturn(List.of(polygon));

        DemandHeatmapResponse response = service.demand(TODAY, TODAY.plusDays(9), null);

        // 4 days × 4 h + 1 day × 2 h = 18 slot-hours ; capacity 10 days × 16 h × 2 = 320
        assertThat(response.getReservations().getFeatures()).singleElement().satisfies(f -> {
            assertThat(f.getProperties()).containsEntry("weight", 18.0).containsEntry("occupancy", 0.0563);
        });
        assertThat(response.getMaxReservationWeight()).isEqualTo(18.0);
        assertThat(response.getTargets().getFeatures()).singleElement()
                .satisfies(f -> assertThat(f.getProperties()).containsEntry("type", "POLYGONE").containsEntry("weight", 1));
        assertThat(response.getByZone()).extracting(DemandHeatmapResponse.ZoneDemand::getZoneName)
                .containsExactly("La Marsa", "Tunis Centre");
        assertThat(response.getByZone().get(1)).satisfies(z -> {
            assertThat(z.getReservedHours()).isEqualTo(18.0);
            assertThat(z.getCapacityHours()).isEqualTo(320.0);
            assertThat(z.getTargets()).isEqualTo(1);
        });
    }

    @Test
    void publicDemandExposesOccupancyWithoutCampaignData() {
        when(reservationRepository.findByStatusesOverlappingDates(any(), any(), any())).thenReturn(List.of(
                reservation(panel, TODAY, TODAY, 7, 23)));

        HeatmapResponse response = service.demandPublic(TODAY, TODAY, LocalTime.of(7, 0), LocalTime.of(23, 0));

        assertThat(response.getPoints().getFeatures()).hasSize(2);
        assertThat(response.getPoints().getFeatures()).allSatisfy(f ->
                assertThat(f.getProperties()).containsOnlyKeys("supportId", "zoneId", "zoneName", "weight"));
        assertThat(response.getMaxWeight()).isEqualTo(1.0);
        assertThat(response.getByZone()).filteredOn(z -> z.getZoneId() == 2L).singleElement().satisfies(z -> {
            assertThat(z.getOccupancy()).isEqualTo(1.0);
            assertThat(z.getAvailableSupports()).isZero();
            assertThat(z.getTotalSupports()).isEqualTo(1);
        });
    }
}
