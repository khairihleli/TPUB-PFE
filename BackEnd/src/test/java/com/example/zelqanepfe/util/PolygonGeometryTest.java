package com.example.zelqanepfe.util;

import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.EmergencyMessage;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.model.ZoneGeometryType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Shared vectors with {@code FrontEnd/src/lib/__tests__/polygon.test.ts}: keep both files in sync.
 */
class PolygonGeometryTest {

    private static final PolygonGeometry.Limits LIMITS = PolygonGeometry.Limits.DEFAULT;

    private static List<Object> ring(double... lngLat) {
        List<Object> ring = new ArrayList<>();
        for (int i = 0; i < lngLat.length; i += 2) {
            ring.add(List.of(lngLat[i], lngLat[i + 1]));
        }
        return ring;
    }

    private static Map<String, Object> polygon(List<?>... rings) {
        return Map.of("type", "Polygon", "coordinates", List.of(rings));
    }

    private static final List<Object> SQUARE = ring(10.17, 36.79, 10.19, 36.79, 10.19, 36.81, 10.17, 36.81, 10.17, 36.79);
    private static final List<Object> HOLE = ring(10.175, 36.795, 10.185, 36.795, 10.185, 36.805, 10.175, 36.805);
    private static final List<Object> MARSA = ring(10.30, 36.87, 10.33, 36.87, 10.33, 36.89, 10.30, 36.89);

    private static String reason(Object geometry) {
        try {
            PolygonGeometry.validate(geometry, LIMITS);
            return null;
        } catch (PolygonGeometry.InvalidPolygonException ex) {
            return ex.getMessage();
        }
    }

    @Test
    void squareAroundTunis() {
        PolygonGeometry.Shape shape = PolygonGeometry.validate(polygon(SQUARE), LIMITS);
        assertThat(shape.areaKm2()).isEqualTo(3.96);
        assertThat(shape.centroidLat()).isEqualTo(36.8);
        assertThat(shape.centroidLng()).isEqualTo(10.18);
        assertThat(shape.radiusKm()).isEqualTo(1.425);
        assertThat(shape.toGeoJson()).containsEntry("type", "Polygon");
        @SuppressWarnings("unchecked")
        List<List<List<Double>>> coordinates = (List<List<List<Double>>>) shape.toGeoJson().get("coordinates");
        assertThat(coordinates.get(0)).hasSize(5).first().isEqualTo(coordinates.get(0).get(4));
    }

    @Test
    void unclosedRingDuplicatesAndRoundingAreNormalised() {
        PolygonGeometry.Shape shape = PolygonGeometry.validate(polygon(ring(10.17, 36.79, 10.19, 36.79, 10.19, 36.79,
                10.19, 36.81, 10.170000001, 36.81)), LIMITS);
        @SuppressWarnings("unchecked")
        List<List<List<Double>>> coordinates = (List<List<List<Double>>>) shape.toGeoJson().get("coordinates");
        assertThat(coordinates.get(0)).containsExactly(List.of(10.17, 36.79), List.of(10.19, 36.79),
                List.of(10.19, 36.81), List.of(10.17, 36.81), List.of(10.17, 36.79));
    }

    @Test
    void polygonWithHoleAndMultiPolygon() {
        PolygonGeometry.Shape holed = PolygonGeometry.validate(polygon(SQUARE, HOLE), LIMITS);
        assertThat(holed.areaKm2()).isEqualTo(2.97);
        assertThat(holed.contains(36.80, 10.18)).isFalse();
        assertThat(holed.contains(36.792, 10.172)).isTrue();

        PolygonGeometry.Shape multi = PolygonGeometry.validate(Map.of("type", "MultiPolygon", "coordinates",
                List.of(List.of(SQUARE), List.of(MARSA))), LIMITS);
        assertThat(multi.areaKm2()).isEqualTo(9.895);
        assertThat(multi.centroidLat()).isEqualTo(36.848);
        assertThat(multi.centroidLng()).isEqualTo(10.261);
        assertThat(multi.radiusKm()).isEqualTo(10.354);
        assertThat(multi.contains(36.88, 10.31)).isTrue();
        assertThat(multi.contains(36.84, 10.25)).isFalse();
    }

    @Test
    void pointOnAnEdgeOrVertexIsInside() {
        PolygonGeometry.Shape shape = PolygonGeometry.validate(polygon(SQUARE), LIMITS);
        assertThat(shape.contains(36.80, 10.17)).isTrue();
        assertThat(shape.contains(36.79, 10.19)).isTrue();
        assertThat(shape.contains(36.80, 10.1699)).isFalse();
    }

    @Test
    void validationOrderAndFrenchReasons() {
        assertThat(reason(Map.of("type", "Point", "coordinates", List.of(10.0, 36.0)))).isEqualTo(PolygonGeometry.MSG_GEOMETRY);
        assertThat(reason(Map.of("type", "Polygon", "coordinates", List.of(List.of(List.of("a", "b"))))))
                .isEqualTo(PolygonGeometry.MSG_GEOMETRY);
        assertThat(reason("Polygon")).isEqualTo(PolygonGeometry.MSG_GEOMETRY);
        assertThat(reason(polygon(ring(10.17, 96.0, 10.19, 36.79, 10.19, 36.81)))).isEqualTo(PolygonGeometry.MSG_BOUNDS);
        assertThat(reason(polygon(ring(10.17, 36.79, 10.19, 36.79, 10.17, 36.79)))).isEqualTo(PolygonGeometry.MSG_MIN_VERTICES);
        assertThat(reason(polygon(ring(10.17, 36.79, 10.19, 36.81, 10.19, 36.79, 10.17, 36.81))))
                .isEqualTo(PolygonGeometry.MSG_CROSSING);
        // hole outside its outer ring
        assertThat(reason(polygon(SQUARE, MARSA))).isEqualTo(PolygonGeometry.MSG_CROSSING);
        assertThat(reason(polygon(ring(10.17, 36.79, 10.1701, 36.79, 10.1701, 36.7901))))
                .isEqualTo("Zone trop petite (0,01 km² minimum).");
        assertThat(reason(polygon(ring(9.0, 36.0, 10.0, 36.0, 10.0, 37.0, 9.0, 37.0))))
                .isEqualTo("Zone trop grande (2 000 km² maximum).");
        assertThat(reason(polygon(ring(9.0, 36.8, 10.2, 36.8, 10.2, 36.81, 9.0, 36.81))))
                .isEqualTo("Zone trop étendue (50 km autour de son centre au maximum).");
    }

    @Test
    void detailLimits() {
        List<Object> many = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            double angle = 2 * Math.PI * i / 101;
            many.add(List.of(10.18 + 0.02 * Math.cos(angle), 36.80 + 0.02 * Math.sin(angle)));
        }
        assertThat(reason(polygon(many))).isEqualTo("Polygone trop détaillé (100 sommets au plus).");
        List<Object> parts = new ArrayList<>(Collections.nCopies(6, List.of(SQUARE)));
        assertThat(reason(Map.of("type", "MultiPolygon", "coordinates", parts)))
                .isEqualTo("Polygone trop détaillé (5 parties au plus).");
        assertThat(reason(polygon(SQUARE, HOLE, HOLE, HOLE, HOLE, HOLE, HOLE)))
                .isEqualTo("Polygone trop détaillé (5 trous au plus par partie).");
        PolygonGeometry.Limits tight = new PolygonGeometry.Limits(100, 6, 5, 5, 0.01, 2000, 50);
        assertThatThrownBy(() -> PolygonGeometry.validate(polygon(SQUARE, HOLE), tight))
                .hasMessage("Polygone trop détaillé (6 sommets au plus au total).");
    }

    @Test
    void frenchNumbers() {
        assertThat(PolygonGeometry.formatFr(0.01)).isEqualTo("0,01");
        assertThat(PolygonGeometry.formatFr(2000)).isEqualTo("2 000");
        assertThat(PolygonGeometry.formatFr(50)).isEqualTo("50");
        assertThat(PolygonGeometry.formatFr(1234567.5)).isEqualTo("1 234 567,5");
    }

    @Test
    void storedGeometryReaderNeverThrows() {
        assertThat(PolygonGeometry.fromStored(null)).isNull();
        assertThat(PolygonGeometry.fromStored(Map.of("type", "Polygon"))).isNull();
        assertThat(PolygonGeometry.fromStored(polygon(SQUARE))).isNotNull();
    }

    @Test
    void targetingOfCampaignZonesAndEmergencies() {
        Zone centre = Zone.builder().id(1L).build();
        Zone marsa = Zone.builder().id(2L).build();
        DiffusionSupport support = DiffusionSupport.builder().id(1L).zone(centre)
                .latitude(new BigDecimal("36.8000")).longitude(new BigDecimal("10.1800")).build();
        CampaignZone polygonZone = CampaignZone.builder().geometryType(ZoneGeometryType.POLYGONE).polygon(polygon(MARSA))
                .latitude(new BigDecimal("36.88")).longitude(new BigDecimal("10.315")).radiusKm(new BigDecimal("50")).build();
        CampaignZone circle = CampaignZone.builder().geometryType(ZoneGeometryType.CERCLE)
                .latitude(new BigDecimal("36.8010")).longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("0.5")).build();
        assertThat(TargetingGeometry.inside(support, polygonZone)).isFalse();
        assertThat(TargetingGeometry.inside(support, circle)).isTrue();
        assertThat(TargetingGeometry.insideAny(support, List.of(polygonZone, circle))).isTrue();
        assertThat(TargetingGeometry.distanceKm(support, polygonZone)).isGreaterThan(10);
        CampaignZone around = CampaignZone.builder().geometryType(ZoneGeometryType.POLYGONE).polygon(polygon(SQUARE))
                .latitude(new BigDecimal("36.80")).longitude(new BigDecimal("10.17")).radiusKm(new BigDecimal("2")).build();
        assertThat(TargetingGeometry.distanceKm(support, around)).isZero();

        EmergencyMessage byZone = EmergencyMessage.builder().zone(centre).build();
        assertThat(TargetingGeometry.emergencyTargets(byZone, support)).isTrue();
        EmergencyMessage byCircle = EmergencyMessage.builder().zone(marsa).latitude(new BigDecimal("36.8010"))
                .longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("0.5")).build();
        assertThat(TargetingGeometry.emergencyTargets(byCircle, support)).isTrue();
        EmergencyMessage byPolygon = EmergencyMessage.builder().zone(centre).targetPolygon(polygon(MARSA)).build();
        assertThat(TargetingGeometry.emergencyTargets(byPolygon, support)).isFalse();
    }
}
