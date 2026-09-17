package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignZoneRequest;
import com.example.tpubpfe.dto.CampaignZoneResponse;
import com.example.tpubpfe.dto.CampaignZonesUpdateResponse;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.util.GeoUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Campaign targeting circles (point + radius, up to 5) — contract §2.1 zones endpoints.
 */
@Service
@RequiredArgsConstructor
public class CampaignZoneService {

    static final int MAX_ZONES = 5;
    /** Radius assumed for a TPUB zone without radius (same default as the V3 backfill). */
    static final double DEFAULT_ZONE_RADIUS_KM = 3.0;

    private final CampaignRepository campaignRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ZoneRepository zoneRepository;
    private final CampaignAccessGuard accessGuard;
    private final CampaignMapper campaignMapper;
    private final CampaignReservationSync reservationSync;

    @Transactional(readOnly = true)
    public List<CampaignZoneResponse> getZones(Long campaignId) {
        Campaign campaign = accessGuard.readable(campaignId);
        return campaignMapper.toZoneResponses(campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId()));
    }

    @Transactional
    public CampaignZonesUpdateResponse setZones(Long campaignId, CampaignZoneRequest request) {
        Campaign campaign = accessGuard.owned(campaignId);
        List<CampaignZoneRequest.Circle> circles = request == null || request.getZones() == null
                ? List.of() : request.getZones();
        if (circles.size() > MAX_ZONES) {
            throw CampaignErrors.zoneLimitExceeded();
        }
        if (circles.isEmpty()) {
            throw CampaignErrors.validationFailed("zones", "Ciblez au moins une zone (1 à 5 cercles).");
        }
        if (!CampaignLifecycle.acceptsUpdate(campaign.getStatus())) {
            throw CampaignErrors.notEditable();
        }

        List<Zone> activeZones = zoneRepository.findByIsActiveTrue();
        List<CampaignZone> rows = new ArrayList<>();
        for (CampaignZoneRequest.Circle circle : circles) {
            double lat = circle.getLatitude().doubleValue();
            double lng = circle.getLongitude().doubleValue();
            Zone zone = resolveZone(lat, lng, activeZones).orElseThrow(CampaignErrors::invalidZone);
            rows.add(CampaignZone.builder()
                    .campaign(campaign)
                    .zone(zone)
                    .latitude(circle.getLatitude().setScale(7, RoundingMode.HALF_UP))
                    .longitude(circle.getLongitude().setScale(7, RoundingMode.HALF_UP))
                    .radiusKm(circle.getRadiusKm().setScale(3, RoundingMode.HALF_UP))
                    .label(circle.getLabel() == null || circle.getLabel().isBlank() ? null : circle.getLabel().trim())
                    .build());
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

    static boolean supportInsideAny(Reservation reservation, List<CampaignZone> circles) {
        if (reservation.getSupport() == null || reservation.getSupport().getLatitude() == null
                || reservation.getSupport().getLongitude() == null) {
            return false;
        }
        double lat = reservation.getSupport().getLatitude().doubleValue();
        double lng = reservation.getSupport().getLongitude().doubleValue();
        return circles.stream().anyMatch(circle -> GeoUtils.within(lat, lng,
                circle.getLatitude().doubleValue(), circle.getLongitude().doubleValue(),
                circle.getRadiusKm().doubleValue()));
    }

    private static double distance(Zone zone, double lat, double lng) {
        return GeoUtils.distanceKm(lat, lng, zone.getLatitude().doubleValue(), zone.getLongitude().doubleValue());
    }

    private static double radius(Zone zone) {
        BigDecimal radius = zone.getRadiusKm();
        return radius == null ? DEFAULT_ZONE_RADIUS_KM : radius.doubleValue();
    }
}
