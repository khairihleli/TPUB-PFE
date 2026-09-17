package com.example.tpubpfe.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * GeoJSON Polygon / MultiPolygon validation and measures (docs/round2-contract.md §4.2). Pure, no I/O. Mirrored in
 * {@code FrontEnd/src/lib/polygon.ts} with the same constants, messages and test vectors.
 *
 * <p>Internal representation: parts → rings → open vertex lists (closing point removed), each vertex
 * {@code [lng, lat]} rounded to 7 decimals. Ring 0 of a part is its outer ring, the others are holes.
 */
public final class PolygonGeometry {

    public static final String MSG_GEOMETRY = "Géométrie invalide (Polygon ou MultiPolygon attendu).";
    public static final String MSG_BOUNDS = "Coordonnées hors limites.";
    public static final String MSG_MIN_VERTICES = "Un polygone doit avoir au moins 3 sommets.";
    public static final String MSG_CROSSING = "Le tracé du polygone se croise.";
    /** Distance (degrees) under which a point is considered on an edge, hence inside. */
    static final double EDGE_EPSILON = 1e-9;

    private PolygonGeometry() {
    }

    /** Validation limits (§4.1). */
    public record Limits(int maxVertices, int maxTotalVertices, int maxParts, int maxHoles, double minAreaKm2,
                         double maxAreaKm2, double maxRadiusKm) {

        public static final Limits DEFAULT = new Limits(100, 200, 5, 5, 0.01, 2000, 50);
    }

    /** A validated, normalised shape with its measures. */
    public record Shape(String type, List<List<List<double[]>>> parts, double areaKm2, double centroidLat,
                        double centroidLng, double radiusKm) {

        public boolean contains(double lat, double lng) {
            return PolygonGeometry.contains(parts, lat, lng);
        }

        /** Normalised GeoJSON with closed rings. */
        public Map<String, Object> toGeoJson() {
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("type", type);
            if ("Polygon".equals(type)) {
                json.put("coordinates", ringsToJson(parts.get(0)));
            } else {
                json.put("coordinates", parts.stream().map(PolygonGeometry::ringsToJson).toList());
            }
            return json;
        }
    }

    /** Reason of a rejected geometry (French, shown to the user). */
    public static final class InvalidPolygonException extends RuntimeException {
        public InvalidPolygonException(String reason) {
            super(reason);
        }
    }

    // --- validation ----------------------------------------------------------------------------------------------

    /**
     * Validates a GeoJSON object (as decoded by Jackson: maps, lists, numbers) in the contract order; the first
     * failure wins.
     *
     * @throws InvalidPolygonException with the French reason
     */
    public static Shape validate(Object geoJson, Limits limits) {
        ParsedGeometry parsed = parse(geoJson);
        for (List<List<double[]>> part : parsed.parts()) {
            for (List<double[]> ring : part) {
                for (double[] v : ring) {
                    if (v[1] < -90 || v[1] > 90 || v[0] < -180 || v[0] > 180) {
                        throw new InvalidPolygonException(MSG_BOUNDS);
                    }
                }
            }
        }
        List<List<List<double[]>>> parts = normalise(parsed.parts());
        for (List<List<double[]>> part : parts) {
            for (List<double[]> ring : part) {
                if (distinctCount(ring) < 3) {
                    throw new InvalidPolygonException(MSG_MIN_VERTICES);
                }
            }
        }
        if (parts.size() > limits.maxParts()) {
            throw new InvalidPolygonException(tooDetailed(limits.maxParts() + " parties au plus"));
        }
        int total = 0;
        for (List<List<double[]>> part : parts) {
            if (part.size() - 1 > limits.maxHoles()) {
                throw new InvalidPolygonException(tooDetailed(limits.maxHoles() + " trous au plus par partie"));
            }
            for (List<double[]> ring : part) {
                if (ring.size() > limits.maxVertices()) {
                    throw new InvalidPolygonException(tooDetailed(limits.maxVertices() + " sommets au plus"));
                }
                total += ring.size();
            }
        }
        if (total > limits.maxTotalVertices()) {
            throw new InvalidPolygonException(tooDetailed(limits.maxTotalVertices() + " sommets au plus au total"));
        }
        for (List<List<double[]>> part : parts) {
            for (List<double[]> ring : part) {
                if (selfIntersects(ring)) {
                    throw new InvalidPolygonException(MSG_CROSSING);
                }
            }
            for (int h = 1; h < part.size(); h++) {
                for (double[] v : part.get(h)) {
                    if (!ringContains(part.get(0), v[1], v[0])) {
                        throw new InvalidPolygonException(MSG_CROSSING);
                    }
                }
            }
        }
        Measures measures = measure(parts);
        if (measures.areaKm2() < limits.minAreaKm2()) {
            throw new InvalidPolygonException("Zone trop petite (" + formatFr(limits.minAreaKm2()) + " km² minimum).");
        }
        if (measures.areaKm2() > limits.maxAreaKm2()) {
            throw new InvalidPolygonException("Zone trop grande (" + formatFr(limits.maxAreaKm2()) + " km² maximum).");
        }
        if (measures.radiusKm() > limits.maxRadiusKm()) {
            throw new InvalidPolygonException("Zone trop étendue (" + formatFr(limits.maxRadiusKm())
                    + " km autour de son centre au maximum).");
        }
        return new Shape(parsed.type(), parts, measures.areaKm2(), measures.centroidLat(), measures.centroidLng(),
                measures.radiusKm());
    }

    /**
     * Reads a stored (already validated) geometry without limit checks. Returns null when it cannot be read, so a
     * corrupted row never matches anything.
     */
    public static Shape fromStored(Object geoJson) {
        if (geoJson == null) {
            return null;
        }
        try {
            ParsedGeometry parsed = parse(geoJson);
            List<List<List<double[]>>> parts = normalise(parsed.parts());
            for (List<List<double[]>> part : parts) {
                for (List<double[]> ring : part) {
                    if (distinctCount(ring) < 3) {
                        return null;
                    }
                }
            }
            Measures measures = measure(parts);
            return new Shape(parsed.type(), parts, measures.areaKm2(), measures.centroidLat(), measures.centroidLng(),
                    measures.radiusKm());
        } catch (InvalidPolygonException ex) {
            return null;
        }
    }

    static String tooDetailed(String limit) {
        return "Polygone trop détaillé (" + limit + ").";
    }

    /** {@code 0.01 → "0,01"}, {@code 2000 → "2 000"}, {@code 50 → "50"}. */
    public static String formatFr(double value) {
        BigDecimal decimal = BigDecimal.valueOf(value).stripTrailingZeros();
        if (decimal.scale() < 0) {
            decimal = decimal.setScale(0, RoundingMode.UNNECESSARY);
        }
        String plain = decimal.abs().toPlainString();
        int dot = plain.indexOf('.');
        String integer = dot < 0 ? plain : plain.substring(0, dot);
        String fraction = dot < 0 ? "" : plain.substring(dot + 1);
        StringBuilder grouped = new StringBuilder();
        for (int i = 0; i < integer.length(); i++) {
            if (i > 0 && (integer.length() - i) % 3 == 0) {
                grouped.append(' ');
            }
            grouped.append(integer.charAt(i));
        }
        return (decimal.signum() < 0 ? "-" : "") + grouped + (fraction.isEmpty() ? "" : "," + fraction);
    }

    // --- parsing -------------------------------------------------------------------------------------------------

    private record ParsedGeometry(String type, List<List<List<double[]>>> parts) {
    }

    private static ParsedGeometry parse(Object geoJson) {
        if (!(geoJson instanceof Map<?, ?> map)) {
            throw new InvalidPolygonException(MSG_GEOMETRY);
        }
        Object type = map.get("type");
        Object coordinates = map.get("coordinates");
        if ("Polygon".equals(type)) {
            return new ParsedGeometry("Polygon", List.of(parsePolygon(coordinates)));
        }
        if ("MultiPolygon".equals(type)) {
            if (!(coordinates instanceof List<?> list) || list.isEmpty()) {
                throw new InvalidPolygonException(MSG_GEOMETRY);
            }
            List<List<List<double[]>>> parts = new ArrayList<>();
            for (Object polygon : list) {
                parts.add(parsePolygon(polygon));
            }
            return new ParsedGeometry("MultiPolygon", parts);
        }
        throw new InvalidPolygonException(MSG_GEOMETRY);
    }

    private static List<List<double[]>> parsePolygon(Object coordinates) {
        if (!(coordinates instanceof List<?> rings) || rings.isEmpty()) {
            throw new InvalidPolygonException(MSG_GEOMETRY);
        }
        List<List<double[]>> result = new ArrayList<>();
        for (Object ring : rings) {
            if (!(ring instanceof List<?> positions)) {
                throw new InvalidPolygonException(MSG_GEOMETRY);
            }
            List<double[]> vertices = new ArrayList<>();
            for (Object position : positions) {
                if (!(position instanceof List<?> pair) || pair.size() < 2
                        || !(pair.get(0) instanceof Number lng) || !(pair.get(1) instanceof Number lat)
                        || !Double.isFinite(lng.doubleValue()) || !Double.isFinite(lat.doubleValue())) {
                    throw new InvalidPolygonException(MSG_GEOMETRY);
                }
                vertices.add(new double[]{lng.doubleValue(), lat.doubleValue()});
            }
            result.add(vertices);
        }
        return result;
    }

    /** Rounds to 7 decimals, removes consecutive duplicates and the closing point(s). */
    static List<List<List<double[]>>> normalise(List<List<List<double[]>>> parts) {
        List<List<List<double[]>>> result = new ArrayList<>();
        for (List<List<double[]>> part : parts) {
            List<List<double[]>> rings = new ArrayList<>();
            for (List<double[]> ring : part) {
                List<double[]> clean = new ArrayList<>();
                for (double[] v : ring) {
                    double[] rounded = {round7(v[0]), round7(v[1])};
                    if (clean.isEmpty() || !same(clean.get(clean.size() - 1), rounded)) {
                        clean.add(rounded);
                    }
                }
                while (clean.size() > 1 && same(clean.get(0), clean.get(clean.size() - 1))) {
                    clean.remove(clean.size() - 1);
                }
                rings.add(clean);
            }
            result.add(rings);
        }
        return result;
    }

    static double round7(double value) {
        return BigDecimal.valueOf(value).setScale(7, RoundingMode.HALF_UP).doubleValue();
    }

    private static boolean same(double[] a, double[] b) {
        return a[0] == b[0] && a[1] == b[1];
    }

    private static int distinctCount(List<double[]> ring) {
        Set<String> keys = new HashSet<>();
        for (double[] v : ring) {
            keys.add(v[0] + "," + v[1]);
        }
        return keys.size();
    }

    private static List<List<Double>> closedRing(List<double[]> ring) {
        List<List<Double>> out = new ArrayList<>();
        for (double[] v : ring) {
            out.add(List.of(v[0], v[1]));
        }
        if (!ring.isEmpty()) {
            out.add(List.of(ring.get(0)[0], ring.get(0)[1]));
        }
        return out;
    }

    private static List<List<List<Double>>> ringsToJson(List<List<double[]>> rings) {
        return rings.stream().map(PolygonGeometry::closedRing).toList();
    }

    // --- topology ------------------------------------------------------------------------------------------------

    /** Any pair of non-adjacent edges intersecting (touching included). */
    static boolean selfIntersects(List<double[]> ring) {
        int n = ring.size();
        for (int i = 0; i < n; i++) {
            double[] a = ring.get(i);
            double[] b = ring.get((i + 1) % n);
            for (int j = i + 1; j < n; j++) {
                if (j == i + 1 || (i == 0 && j == n - 1)) {
                    continue;
                }
                double[] c = ring.get(j);
                double[] d = ring.get((j + 1) % n);
                if (segmentsIntersect(a, b, c, d)) {
                    return true;
                }
            }
        }
        return false;
    }

    static boolean segmentsIntersect(double[] p1, double[] p2, double[] p3, double[] p4) {
        double d1 = orientation(p3, p4, p1);
        double d2 = orientation(p3, p4, p2);
        double d3 = orientation(p1, p2, p3);
        double d4 = orientation(p1, p2, p4);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }
        return (d1 == 0 && onSegment(p3, p4, p1)) || (d2 == 0 && onSegment(p3, p4, p2))
                || (d3 == 0 && onSegment(p1, p2, p3)) || (d4 == 0 && onSegment(p1, p2, p4));
    }

    private static double orientation(double[] a, double[] b, double[] c) {
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    }

    private static boolean onSegment(double[] a, double[] b, double[] p) {
        return p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
                && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
    }

    /** Even-odd ray casting over every ring of each part; a point on an edge is inside. */
    public static boolean contains(List<List<List<double[]>>> parts, double lat, double lng) {
        for (List<List<double[]>> part : parts) {
            boolean inside = false;
            for (List<double[]> ring : part) {
                if (onRingEdge(ring, lat, lng)) {
                    return true;
                }
                if (crossingsOdd(ring, lat, lng)) {
                    inside = !inside;
                }
            }
            if (inside) {
                return true;
            }
        }
        return false;
    }

    private static boolean ringContains(List<double[]> ring, double lat, double lng) {
        return onRingEdge(ring, lat, lng) || crossingsOdd(ring, lat, lng);
    }

    private static boolean crossingsOdd(List<double[]> ring, double lat, double lng) {
        boolean odd = false;
        int n = ring.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = ring.get(i)[0];
            double yi = ring.get(i)[1];
            double xj = ring.get(j)[0];
            double yj = ring.get(j)[1];
            if ((yi > lat) != (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
                odd = !odd;
            }
        }
        return odd;
    }

    private static boolean onRingEdge(List<double[]> ring, double lat, double lng) {
        int n = ring.size();
        for (int i = 0; i < n; i++) {
            if (distanceToSegment(ring.get(i), ring.get((i + 1) % n), lng, lat) < EDGE_EPSILON) {
                return true;
            }
        }
        return false;
    }

    private static double distanceToSegment(double[] a, double[] b, double x, double y) {
        double dx = b[0] - a[0];
        double dy = b[1] - a[1];
        double lengthSquared = dx * dx + dy * dy;
        double t = lengthSquared == 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
        double px = a[0] + t * dx;
        double py = a[1] + t * dy;
        return Math.hypot(x - px, y - py);
    }

    // --- measures ------------------------------------------------------------------------------------------------

    record Measures(double areaKm2, double centroidLat, double centroidLng, double radiusKm) {
    }

    /**
     * Equirectangular projection around {@code lat0} = mean latitude of the outer-ring vertices (translated to
     * the mean position for precision; area and centroid are translation invariant), planar shoelace, area-weighted
     * centroid, haversine circumscribed radius.
     */
    static Measures measure(List<List<List<double[]>>> parts) {
        double sumLat = 0;
        double sumLng = 0;
        int count = 0;
        for (List<List<double[]>> part : parts) {
            for (double[] v : part.get(0)) {
                sumLat += v[1];
                sumLng += v[0];
                count++;
            }
        }
        double lat0 = sumLat / count;
        double lng0 = sumLng / count;
        double cos0 = Math.cos(Math.toRadians(lat0));
        double r = GeoUtils.EARTH_RADIUS_KM;

        double totalArea = 0;
        double weightedX = 0;
        double weightedY = 0;
        for (List<List<double[]>> part : parts) {
            double partArea = 0;
            double partX = 0;
            double partY = 0;
            for (int k = 0; k < part.size(); k++) {
                double[] ringMeasure = ringMeasure(part.get(k), lat0, lng0, cos0, r);
                double sign = k == 0 ? 1 : -1;
                partArea += sign * ringMeasure[0];
                partX += sign * ringMeasure[0] * ringMeasure[1];
                partY += sign * ringMeasure[0] * ringMeasure[2];
            }
            if (partArea > 0) {
                totalArea += partArea;
                weightedX += partX;
                weightedY += partY;
            }
        }
        double cx;
        double cy;
        if (totalArea > 0) {
            cx = weightedX / totalArea;
            cy = weightedY / totalArea;
        } else {
            cx = 0;
            cy = 0;
        }
        double centroidLat = round7(lat0 + Math.toDegrees(cy / r));
        double centroidLng = round7(lng0 + Math.toDegrees(cx / (r * cos0)));
        double radius = 0;
        for (List<List<double[]>> part : parts) {
            for (List<double[]> ring : part) {
                for (double[] v : ring) {
                    radius = Math.max(radius, GeoUtils.distanceKm(centroidLat, centroidLng, v[1], v[0]));
                }
            }
        }
        return new Measures(round3(Math.max(0, totalArea)), centroidLat, centroidLng, round3(radius));
    }

    /** [|area|, centroidX, centroidY] of one ring in the projection. */
    private static double[] ringMeasure(List<double[]> ring, double lat0, double lng0, double cos0, double r) {
        int n = ring.size();
        double[] xs = new double[n];
        double[] ys = new double[n];
        for (int i = 0; i < n; i++) {
            xs[i] = r * Math.toRadians(ring.get(i)[0] - lng0) * cos0;
            ys[i] = r * Math.toRadians(ring.get(i)[1] - lat0);
        }
        double twiceArea = 0;
        double cx = 0;
        double cy = 0;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            double cross = xs[i] * ys[j] - xs[j] * ys[i];
            twiceArea += cross;
            cx += (xs[i] + xs[j]) * cross;
            cy += (ys[i] + ys[j]) * cross;
        }
        if (twiceArea == 0) {
            double mx = 0;
            double my = 0;
            for (int i = 0; i < n; i++) {
                mx += xs[i];
                my += ys[i];
            }
            return new double[]{0, mx / n, my / n};
        }
        return new double[]{Math.abs(twiceArea / 2), cx / (3 * twiceArea), cy / (3 * twiceArea)};
    }

    static double round3(double value) {
        return BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP).doubleValue();
    }
}
