package com.example.tpubpfe.util;

import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.ZoneGeometryType;

import java.util.List;

/**
 * "Is this support targeted?" for campaign zones (circles and polygons, docs/round2-contract.md §4.3) and emergencies
 * (polygon &gt; circle &gt; zone, §4.4). Pure, no I/O.
 */
public final class TargetingGeometry {

    private TargetingGeometry() {
    }

    /** Haversine for a CERCLE, point-in-polygon for a POLYGONE (an unreadable stored polygon matches nothing). */
    public static boolean inside(DiffusionSupport support, CampaignZone zone) {
        if (support == null || support.getLatitude() == null || support.getLongitude() == null || zone == null) {
            return false;
        }
        double lat = support.getLatitude().doubleValue();
        double lng = support.getLongitude().doubleValue();
        if (zone.getGeometryType() == ZoneGeometryType.POLYGONE) {
            PolygonGeometry.Shape shape = PolygonGeometry.fromStored(zone.getPolygon());
            return shape != null && shape.contains(lat, lng);
        }
        if (zone.getLatitude() == null || zone.getLongitude() == null || zone.getRadiusKm() == null) {
            return false;
        }
        return GeoUtils.within(lat, lng, zone.getLatitude().doubleValue(), zone.getLongitude().doubleValue(),
                zone.getRadiusKm().doubleValue());
    }

    public static boolean insideAny(DiffusionSupport support, List<CampaignZone> zones) {
        return zones != null && zones.stream().anyMatch(zone -> inside(support, zone));
    }

    /**
     * Availability distance: 0 inside a polygon, otherwise the distance to its centroid (stored in
     * {@code latitude/longitude}); the distance to the centre for a circle.
     */
    public static double distanceKm(DiffusionSupport support, CampaignZone zone) {
        double lat = support.getLatitude().doubleValue();
        double lng = support.getLongitude().doubleValue();
        if (zone.getGeometryType() == ZoneGeometryType.POLYGONE && inside(support, zone)) {
            return 0;
        }
        return GeoUtils.distanceKm(lat, lng, zone.getLatitude().doubleValue(), zone.getLongitude().doubleValue());
    }

    /** Emergency targeting: polygon → PIP; complete circle → haversine; otherwise same zone id. */
    public static boolean emergencyTargets(EmergencyMessage message, DiffusionSupport support) {
        if (message == null || support == null) {
            return false;
        }
        if (message.getTargetPolygon() != null) {
            if (support.getLatitude() == null || support.getLongitude() == null) {
                return false;
            }
            PolygonGeometry.Shape shape = PolygonGeometry.fromStored(message.getTargetPolygon());
            return shape != null && shape.contains(support.getLatitude().doubleValue(),
                    support.getLongitude().doubleValue());
        }
        if (message.getLatitude() != null && message.getLongitude() != null && message.getRadiusKm() != null) {
            if (support.getLatitude() == null || support.getLongitude() == null) {
                return false;
            }
            return GeoUtils.within(support.getLatitude().doubleValue(), support.getLongitude().doubleValue(),
                    message.getLatitude().doubleValue(), message.getLongitude().doubleValue(),
                    message.getRadiusKm().doubleValue());
        }
        return message.getZone() != null && support.getZone() != null && message.getZone().getId() != null
                && message.getZone().getId().equals(support.getZone().getId());
    }
}
