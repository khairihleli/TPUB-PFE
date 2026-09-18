package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.EmergencyRequest;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.util.PolygonGeometry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EmergencyTargetingTest {

    private final Zone centre = Zone.builder().id(1L).name("Tunis Centre").latitude(new BigDecimal("36.8000"))
            .longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private final Zone marsa = Zone.builder().id(2L).name("La Marsa").latitude(new BigDecimal("36.8780"))
            .longitude(new BigDecimal("10.3240")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private ZoneService zoneService;
    private ZoneRepository zoneRepository;

    private static final Map<String, Object> MARSA_SQUARE = Map.of("type", "Polygon", "coordinates", List.of(List.of(
            List.of(10.31, 36.87), List.of(10.33, 36.87), List.of(10.33, 36.89), List.of(10.31, 36.89))));

    @BeforeEach
    void setUp() {
        zoneService = mock(ZoneService.class);
        zoneRepository = mock(ZoneRepository.class);
        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of(centre, marsa));
        when(zoneService.findZone(1L)).thenReturn(centre);
    }

    @Test
    void polygonResolvesItsZoneFromTheCentroidAndIsNormalised() {
        EmergencyTargeting.Target target = EmergencyTargeting.resolve(
                EmergencyRequest.builder().polygon(MARSA_SQUARE).build(), zoneService, zoneRepository);
        assertThat(target.zone()).isSameAs(marsa);
        assertThat(target.circle()).isFalse();
        assertThat(target.polygon()).containsEntry("type", "Polygon");

        EmergencyTargeting.Target withZone = EmergencyTargeting.resolve(
                EmergencyRequest.builder().zoneId(1L).polygon(MARSA_SQUARE).build(), zoneService, zoneRepository);
        assertThat(withZone.zone()).isSameAs(centre);
    }

    @Test
    void conflictsMissingTargetsAndInvalidPolygons() {
        assertThatThrownBy(() -> EmergencyTargeting.resolve(EmergencyRequest.builder().polygon(MARSA_SQUARE)
                .latitude(new BigDecimal("36.8")).longitude(new BigDecimal("10.1")).radiusKm(BigDecimal.ONE).build(),
                zoneService, zoneRepository))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_CONFLICT");
        assertThatThrownBy(() -> EmergencyTargeting.resolve(EmergencyRequest.builder().build(), zoneService, zoneRepository))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        assertThatThrownBy(() -> EmergencyTargeting.resolve(EmergencyRequest.builder()
                .latitude(new BigDecimal("36.8")).build(), zoneService, zoneRepository))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        Map<String, Object> bowTie = Map.of("type", "Polygon", "coordinates", List.of(List.of(
                List.of(10.17, 36.79), List.of(10.19, 36.81), List.of(10.19, 36.79), List.of(10.17, 36.81))));
        assertThatThrownBy(() -> EmergencyTargeting.resolve(EmergencyRequest.builder().polygon(bowTie).build(),
                zoneService, zoneRepository))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getCode()).isEqualTo("INVALID_POLYGON");
                    assertThat(ex.getErrors()).containsEntry("polygon", PolygonGeometry.MSG_CROSSING);
                });
    }

    @Test
    void circleAndZoneTargetsKeepTheirRoundOneBehaviour() {
        EmergencyTargeting.Target circle = EmergencyTargeting.resolve(EmergencyRequest.builder()
                .latitude(new BigDecimal("36.8790")).longitude(new BigDecimal("10.3200")).radiusKm(BigDecimal.ONE).build(),
                zoneService, zoneRepository);
        assertThat(circle.circle()).isTrue();
        assertThat(circle.zone()).isSameAs(marsa);
        assertThat(circle.polygon()).isNull();
        assertThat(EmergencyTargeting.resolve(EmergencyRequest.builder().zoneId(1L).build(), zoneService, zoneRepository)
                .zone()).isSameAs(centre);
    }
}
