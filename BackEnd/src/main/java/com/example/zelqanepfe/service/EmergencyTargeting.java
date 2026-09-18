package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.EmergencyRequest;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.util.PolygonGeometry;

import java.util.Map;

/**
 * Target resolution of a new emergency (docs/round2-contract.md §4.4): polygon &gt; circle &gt; zone, polygon and
 * circle together rejected, zone resolved from the circle centre or the polygon centroid when absent.
 */
public final class EmergencyTargeting {

    private EmergencyTargeting() {
    }

    /**
     * @param zone    ZELQANE zone of the message (given or resolved)
     * @param circle  true when a complete circle (latitude, longitude, radius) targets the message
     * @param polygon normalised GeoJSON, null without polygon
     */
    public record Target(Zone zone, boolean circle, Map<String, Object> polygon) {
    }

    public static Target resolve(EmergencyRequest request, ZoneService zoneService, ZoneRepository zoneRepository) {
        boolean anyCircle = request.getLatitude() != null || request.getLongitude() != null || request.getRadiusKm() != null;
        boolean fullCircle = request.getLatitude() != null && request.getLongitude() != null && request.getRadiusKm() != null;
        boolean hasPolygon = request.getPolygon() != null;
        if (hasPolygon && anyCircle) {
            throw NetworkErrors.emergencyTargetConflict();
        }
        if (anyCircle && !fullCircle) {
            throw NetworkErrors.emergencyTargetRequired();
        }
        if (request.getZoneId() == null && !fullCircle && !hasPolygon) {
            throw NetworkErrors.emergencyTargetRequired();
        }

        PolygonGeometry.Shape shape = null;
        if (hasPolygon) {
            PolygonGeometry.Limits limits = zoneService.polygonLimits();
            try {
                shape = PolygonGeometry.validate(request.getPolygon(), limits != null ? limits : PolygonGeometry.Limits.DEFAULT);
            } catch (PolygonGeometry.InvalidPolygonException ex) {
                throw NetworkErrors.invalidPolygon("polygon", ex.getMessage());
            }
        }

        Zone zone;
        if (request.getZoneId() != null) {
            zone = zoneService.findZone(request.getZoneId());
        } else if (shape != null) {
            zone = CampaignZoneService.resolveZone(shape.centroidLat(), shape.centroidLng(),
                    zoneRepository.findByIsActiveTrue()).orElseThrow(CampaignErrors::invalidZone);
        } else {
            zone = CampaignZoneService.resolveZone(request.getLatitude().doubleValue(), request.getLongitude().doubleValue(),
                    zoneRepository.findByIsActiveTrue()).orElseThrow(CampaignErrors::invalidZone);
        }
        return new Target(zone, fullCircle, shape != null ? shape.toGeoJson() : null);
    }
}
