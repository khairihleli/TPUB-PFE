package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignZoneRequest;
import com.example.tpubpfe.dto.CampaignZoneResponse;
import com.example.tpubpfe.dto.CampaignZonesUpdateResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.model.ZoneGeometryType;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.util.GeoUtils;
import com.example.tpubpfe.util.PolygonGeometry;
import com.example.tpubpfe.util.TargetingGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Campaign targeting zones (circles and polygons, up to 5) — contract §2.1 zones endpoints, round 2 §4.3.
 */
@Service
@RequiredArgsConstructor
public class CampaignZoneService {

    static final int MAX_ZONES = 5;
    /** Radius assumed for a TPUB zone without radius (same default as the V3 backfill). */
    static final double DEFAULT_ZONE_RADIUS_KM = 3.0;
    /** A polygon row keeps at least this bounding radius (radius_km column bound). */
    static final double MIN_POLYGON_RADIUS_KM = 0.1;

    private final CampaignRepository campaignRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ZoneRepository zoneRepository;
    private final CampaignAccessGuard accessGuard;
    private final CampaignMapper campaignMapper;
    private final CampaignReservationSync reservationSync;
    private final ZoneService zoneService;

    @Transactional(readOnly = true)
    public List<CampaignZoneResponse> getZones(Long campaignId) {
        Campaign campaign = accessGuard.readable(campaignId);
        return campaignMapper.toZoneResponses(campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId()));
    }

    @Transactional
    public CampaignZonesUpdateResponse setZones(Long campaignId, CampaignZoneRequest request) {
        Campaign campaign = accessGuard.owned(campaignId);
        List<CampaignZoneRequest.ZoneInput> inputs = request == null || request.getZones() == null
                ? List.of() : request.getZones();
        if (inputs.size() > MAX_ZONES) {
            throw CampaignErrors.zoneLimitExceeded();
        }
        if (inputs.isEmpty()) {
            throw CampaignErrors.validationFailed("zones", "Ciblez au moins une zone (1 à 5 cercles ou polygones).");
        }
        if (!CampaignLifecycle.acceptsUpdate(campaign.getStatus())) {
            throw CampaignErrors.notEditable();
        }

        List<Zone> activeZones = zoneRepository.findByIsActiveTrue();
        PolygonGeometry.Limits limits = zoneService.polygonLimits();
        List<CampaignZone> rows = new ArrayList<>();
        for (int i = 0; i < inputs.size(); i++) {
            rows.add(toRow(campaign, inputs.get(i), i, activeZones, limits));
        }

        CampaignLifecycle.reopen(campaign);
        campaignRepository.save(campaign);

        campaignZoneRepository.deleteAll(campaignZoneRepository.findByCampaignId(campaign.getId()));
        campaignZoneRepository.flush();
        List<CampaignZone> saved = campaignZoneRepository.saveAll(rows);

        List<Long> cancelled = reservationSync.cancel(campaign, Set.of(ReservationStatus.TEMPORAIRE),
                reservation -> !supportInsideAny(reservation, saved));
        reservationSync.recomputeEstimatedViews(campaign);

        return CampaignZonesUpdateResponse.builder()
                .zones(campaignMapper.toZoneResponses(saved))
                .cancelledReservationIds(cancelled)
                .build();
    }

    /** Validates one input (circle or polygon) and builds its row, centre resolved to a TPUB zone. */
    static CampaignZone toRow(Campaign campaign, CampaignZoneRequest.ZoneInput input, int index, List<Zone> activeZones,
                              PolygonGeometry.Limits limits) {
        String label = input.getLabel() == null || input.getLabel().isBlank() ? null : input.getLabel().trim();
        String prefix = "zones[" + index + "].";
        if ("POLYGONE".equals(input.getType())) {
            if (input.getPolygon() == null) {
                throw NetworkErrors.invalidPolygon(prefix + "polygon", PolygonGeometry.MSG_GEOMETRY);
            }
            PolygonGeometry.Shape shape;
            try {
                shape = PolygonGeometry.validate(input.getPolygon(), limits != null ? limits : PolygonGeometry.Limits.DEFAULT);
            } catch (PolygonGeometry.InvalidPolygonException ex) {
                throw NetworkErrors.invalidPolygon(prefix + "polygon", ex.getMessage());
            }
            Zone zone = resolveZone(shape.centroidLat(), shape.centroidLng(), activeZones)
                    .orElseThrow(CampaignErrors::invalidZone);
            return CampaignZone.builder()
                    .campaign(campaign)
                    .zone(zone)
                    .geometryType(ZoneGeometryType.POLYGONE)
                    .polygon(shape.toGeoJson())
                    .latitude(BigDecimal.valueOf(shape.centroidLat()).setScale(7, RoundingMode.HALF_UP))
                    .longitude(BigDecimal.valueOf(shape.centroidLng()).setScale(7, RoundingMode.HALF_UP))
                    .radiusKm(BigDecimal.valueOf(Math.max(MIN_POLYGON_RADIUS_KM, shape.radiusKm())).setScale(3, RoundingMode.HALF_UP))
                    .areaKm2(BigDecimal.valueOf(shape.areaKm2()).setScale(3, RoundingMode.HALF_UP))
                    .label(label)
                    .build();
        }
        Map<String, String> missing = new LinkedHashMap<>();
        if (input.getLatitude() == null) {
            missing.put(prefix + "latitude", "Latitude obligatoire pour un cercle.");
        }
        if (input.getLongitude() == null) {
            missing.put(prefix + "longitude", "Longitude obligatoire pour un cercle.");
        }
        if (input.getRadiusKm() == null) {
            missing.put(prefix + "radiusKm", "Rayon obligatoire pour un cercle (0,1 à 50 km).");
        }
        if (!missing.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Cercle incomplet : latitude, longitude et rayon sont obligatoires.", missing);
        }
        Zone zone = resolveZone(input.getLatitude().doubleValue(), input.getLongitude().doubleValue(), activeZones)
                .orElseThrow(CampaignErrors::invalidZone);
        BigDecimal radius = input.getRadiusKm().setScale(3, RoundingMode.HALF_UP);
        return CampaignZone.builder()
                .campaign(campaign)
                .zone(zone)
                .geometryType(ZoneGeometryType.CERCLE)
                .latitude(input.getLatitude().setScale(7, RoundingMode.HALF_UP))
                .longitude(input.getLongitude().setScale(7, RoundingMode.HALF_UP))
                .radiusKm(radius)
                .areaKm2(circleArea(radius))
                .label(label)
                .build();
    }

    /** {@code π·r²}, 3 decimals. */
    public static BigDecimal circleArea(BigDecimal radiusKm) {
        double r = radiusKm.doubleValue();
        return BigDecimal.valueOf(Math.PI * r * r).setScale(3, RoundingMode.HALF_UP);
    }

    /**
     * The active zone whose own circle contains the point (nearest centre first), else the nearest active zone.
     */
    static Optional<Zone> resolveZone(double lat, double lng, List<Zone> activeZones) {
        Comparator<Zone> byDistance = Comparator.comparingDouble(zone -> distance(zone, lat, lng));
        Optional<Zone> containing = activeZones.stream()
                .filter(zone -> zone.getLatitude() != null && zone.getLongitude() != null)
                .filter(zone -> distance(zone, lat, lng) <= radius(zone))
                .min(byDistance);
        if (containing.isPresent()) {
            return containing;
        }
        return activeZones.stream()
                .filter(zone -> zone.getLatitude() != null && zone.getLongitude() != null)
                .min(byDistance);
    }

    /** Inside any circle or polygon (docs/round2-contract.md §4.3). */
    static boolean supportInsideAny(Reservation reservation, List<CampaignZone> zones) {
        return TargetingGeometry.insideAny(reservation.getSupport(), zones);
    }

    private static double distance(Zone zone, double lat, double lng) {
        return GeoUtils.distanceKm(lat, lng, zone.getLatitude().doubleValue(), zone.getLongitude().doubleValue());
    }

    private static double radius(Zone zone) {
        BigDecimal radius = zone.getRadiusKm();
        return radius == null ? DEFAULT_ZONE_RADIUS_KM : radius.doubleValue();
    }
}
