package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignZoneRequest;
import com.example.tpubpfe.model.ZoneGeometryType;
import com.example.tpubpfe.util.PolygonGeometry;
import com.example.tpubpfe.dto.CampaignZonesUpdateResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CampaignZoneServiceTest {

    // Tunis centre (radius 5 km) and La Marsa (radius 2 km), ~16 km apart
    private final Zone tunis = Zone.builder().id(1L).name("Tunis Centre").isActive(true)
            .latitude(new BigDecimal("36.8008")).longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("5")).build();
    private final Zone marsa = Zone.builder().id(2L).name("La Marsa").isActive(true)
            .latitude(new BigDecimal("36.8780")).longitude(new BigDecimal("10.3250")).radiusKm(new BigDecimal("2")).build();

    private CampaignZoneRepository campaignZoneRepository;
    private ZoneRepository zoneRepository;
    private CampaignAccessGuard guard;
    private CampaignZoneService service;
    private Campaign campaign;
    private final List<Reservation> reservations = new ArrayList<>();

    @BeforeEach
    void setUp() {
        CampaignRepository campaignRepository = mock(CampaignRepository.class);
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        campaignZoneRepository = mock(CampaignZoneRepository.class);
        zoneRepository = mock(ZoneRepository.class);
        guard = mock(CampaignAccessGuard.class);
        CampaignMapper mapper = mock(CampaignMapper.class);
        ZoneService zoneService = mock(ZoneService.class);
        when(zoneService.polygonLimits()).thenReturn(PolygonGeometry.Limits.DEFAULT);
        service = new CampaignZoneService(campaignRepository, campaignZoneRepository, zoneRepository, guard, mapper,
                new CampaignReservationSync(reservationRepository, campaignRepository), zoneService);

        campaign = Campaign.builder().id(9L).status(CampaignStatus.BROUILLON).build();
        when(guard.owned(9L)).thenReturn(campaign);
        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of(tunis, marsa));
        when(campaignZoneRepository.findByCampaignId(9L)).thenReturn(List.of());
        when(campaignZoneRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(mapper.toZoneResponses(anyList())).thenReturn(List.of());
        when(reservationRepository.findByCampaignId(9L)).thenReturn(reservations);
        when(reservationRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private static CampaignZoneRequest.ZoneInput circle(String lat, String lng, String radius) {
        return CampaignZoneRequest.ZoneInput.builder()
                .latitude(new BigDecimal(lat)).longitude(new BigDecimal(lng)).radiusKm(new BigDecimal(radius)).build();
    }

    @Test
    void resolveZonePrefersAZoneWhoseCircleContainsThePoint() {
        // Point inside La Marsa's circle but still reasonably close to Tunis
        assertThat(CampaignZoneService.resolveZone(36.8790, 10.3200, List.of(tunis, marsa))).contains(marsa);
        // Point in the sea, outside both circles: nearest zone wins
        assertThat(CampaignZoneService.resolveZone(36.9500, 10.4500, List.of(tunis, marsa))).contains(marsa);
        assertThat(CampaignZoneService.resolveZone(36.70, 10.10, List.of(tunis, marsa))).contains(tunis);
        assertThat(CampaignZoneService.resolveZone(36.70, 10.10, List.of())).isEmpty();
    }

    @Test
    void containingZoneWinsOverACloserCentreOutsideItsRadius() {
        Zone tiny = Zone.builder().id(3L).name("Tiny").isActive(true)
                .latitude(new BigDecimal("36.8100")).longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("0.5")).build();
        Zone wide = Zone.builder().id(4L).name("Wide").isActive(true)
                .latitude(new BigDecimal("36.7800")).longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("10")).build();
        // 36.800: ~1.1 km from Tiny (outside its 0.5 km radius), ~2.2 km from Wide (inside)
        assertThat(CampaignZoneService.resolveZone(36.8000, 10.1800, List.of(tiny, wide))).contains(wide);
    }

    @Test
    void setZonesReplacesCirclesAndCancelsTemporaryReservationsOutsideThem() {
        campaign.setStatus(CampaignStatus.REJECTED_BY_AI);
        DiffusionSupport near = DiffusionSupport.builder().id(1L)
                .latitude(new BigDecimal("36.8010")).longitude(new BigDecimal("10.1810")).build();
        DiffusionSupport far = DiffusionSupport.builder().id(2L)
                .latitude(new BigDecimal("35.8256")).longitude(new BigDecimal("10.6084")).build();
        Reservation keep = Reservation.builder().id(11L).support(near).reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(100L).build();
        Reservation drop = Reservation.builder().id(12L).support(far).reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(400L).build();
        reservations.addAll(List.of(keep, drop));

        CampaignZonesUpdateResponse response = service.setZones(9L, CampaignZoneRequest.builder()
                .zones(List.of(circle("36.8008", "10.1800", "2"))).build());

        assertThat(campaign.getStatus()).isEqualTo(CampaignStatus.BROUILLON);
        assertThat(response.getCancelledReservationIds()).containsExactly(12L);
        assertThat(keep.getReservationStatus()).isEqualTo(ReservationStatus.TEMPORAIRE);
        assertThat(drop.getReservationStatus()).isEqualTo(ReservationStatus.ANNULEE);
        assertThat(campaign.getEstimatedViews()).isEqualTo(100L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<CampaignZone>> saved = ArgumentCaptor.forClass(List.class);
        verify(campaignZoneRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).singleElement().satisfies(zone -> {
            assertThat(zone.getZone()).isSameAs(tunis);
            assertThat(zone.getRadiusKm()).isEqualByComparingTo("2.000");
        });
    }

    @Test
    void setZonesValidatesCountStatusAndZones() {
        List<CampaignZoneRequest.ZoneInput> six = Collections.nCopies(6, circle("36.8", "10.18", "1"));
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder().zones(six).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ZONE_LIMIT_EXCEEDED");

        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder().zones(List.of()).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("VALIDATION_FAILED");

        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of());
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder()
                .zones(List.of(circle("36.8", "10.18", "1"))).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_ZONE");

        campaign.setStatus(CampaignStatus.ACTIVE);
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder()
                .zones(List.of(circle("36.8", "10.18", "1"))).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CAMPAIGN_NOT_EDITABLE");
    }

    private static CampaignZoneRequest.ZoneInput polygon(double... lngLat) {
        List<Object> ring = new ArrayList<>();
        for (int i = 0; i < lngLat.length; i += 2) {
            ring.add(List.of(lngLat[i], lngLat[i + 1]));
        }
        return CampaignZoneRequest.ZoneInput.builder().type("POLYGONE")
                .polygon(java.util.Map.of("type", "Polygon", "coordinates", List.of(ring))).build();
    }

    @Test
    void polygonZonesStoreCentroidBoundingRadiusAreaAndKeepSupportsInside() {
        DiffusionSupport inside = DiffusionSupport.builder().id(1L)
                .latitude(new BigDecimal("36.8000")).longitude(new BigDecimal("10.1800")).build();
        // inside the bounding circle but outside the polygon (north-east corner area of a triangle)
        DiffusionSupport corner = DiffusionSupport.builder().id(2L)
                .latitude(new BigDecimal("36.8090")).longitude(new BigDecimal("10.1890")).build();
        Reservation keep = Reservation.builder().id(21L).support(inside).reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(10L).build();
        Reservation drop = Reservation.builder().id(22L).support(corner).reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(10L).build();
        reservations.addAll(List.of(keep, drop));

        CampaignZonesUpdateResponse response = service.setZones(9L, CampaignZoneRequest.builder().zones(List.of(
                polygon(10.17, 36.79, 10.19, 36.79, 10.17, 36.81, 10.17, 36.79),
                circle("36.8780", "10.3250", "1"))).build());

        assertThat(response.getCancelledReservationIds()).containsExactly(22L);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<CampaignZone>> saved = ArgumentCaptor.forClass(List.class);
        verify(campaignZoneRepository).saveAll(saved.capture());
        CampaignZone triangle = saved.getValue().get(0);
        assertThat(triangle.getGeometryType()).isEqualTo(ZoneGeometryType.POLYGONE);
        assertThat(triangle.getZone()).isSameAs(tunis);
        assertThat(triangle.getPolygon()).containsEntry("type", "Polygon");
        assertThat(triangle.getLatitude().doubleValue()).isCloseTo(36.7967, org.assertj.core.data.Offset.offset(0.0002));
        assertThat(triangle.getLongitude().doubleValue()).isCloseTo(10.1767, org.assertj.core.data.Offset.offset(0.0002));
        assertThat(triangle.getAreaKm2().doubleValue()).isCloseTo(1.98, org.assertj.core.data.Offset.offset(0.01));
        assertThat(triangle.getRadiusKm().doubleValue()).isGreaterThan(1.0);
        CampaignZone circle = saved.getValue().get(1);
        assertThat(circle.getGeometryType()).isEqualTo(ZoneGeometryType.CERCLE);
        assertThat(circle.getPolygon()).isNull();
        assertThat(circle.getAreaKm2()).isEqualByComparingTo("3.142");
    }

    @Test
    void invalidPolygonAndIncompleteCircleAreReportedOnTheirZone() {
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder().zones(List.of(
                circle("36.8", "10.18", "1"),
                polygon(10.17, 36.79, 10.19, 36.81, 10.19, 36.79, 10.17, 36.81))).build()))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getCode()).isEqualTo("INVALID_POLYGON");
                    assertThat(ex.getErrors()).containsEntry("zones[1].polygon", PolygonGeometry.MSG_CROSSING);
                });
        CampaignZoneRequest.ZoneInput noRadius = CampaignZoneRequest.ZoneInput.builder()
                .latitude(new BigDecimal("36.8")).longitude(new BigDecimal("10.18")).build();
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder().zones(List.of(noRadius)).build()))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getCode()).isEqualTo("VALIDATION_FAILED");
                    assertThat(ex.getErrors()).containsKey("zones[0].radiusKm");
                });
        CampaignZoneRequest.ZoneInput missing = CampaignZoneRequest.ZoneInput.builder().type("POLYGONE").build();
        assertThatThrownBy(() -> service.setZones(9L, CampaignZoneRequest.builder().zones(List.of(missing)).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_POLYGON");
    }
}
