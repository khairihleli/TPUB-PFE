package com.example.zelqanepfe.util;

/**
 * Great-circle helpers (haversine) shared by campaign zones, availability and diffusion.
 */
public final class GeoUtils {

    public static final double EARTH_RADIUS_KM = 6371.0088;

    private GeoUtils() {
    }

    public static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    public static boolean within(double lat, double lng, double cLat, double cLng, double radiusKm) {
        return distanceKm(lat, lng, cLat, cLng) <= radiusKm;
    }

}
