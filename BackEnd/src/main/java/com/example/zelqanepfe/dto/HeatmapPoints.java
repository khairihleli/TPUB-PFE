package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * GeoJSON {@code FeatureCollection<Point>} of a heatmap (docs/round2-contract.md §4.5): coordinates {@code [lng, lat]},
 * {@code properties.weight ≥ 0}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeatmapPoints {

    @Builder.Default
    private String type = "FeatureCollection";
    @Builder.Default
    private List<Feature> features = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Feature {
        @Builder.Default
        private String type = "Feature";
        private Geometry geometry;
        private Map<String, Object> properties;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Geometry {
        @Builder.Default
        private String type = "Point";
        /** [lng, lat]. */
        private double[] coordinates;
    }

    public static Feature point(double lat, double lng, Map<String, Object> properties) {
        return Feature.builder()
                .geometry(Geometry.builder().coordinates(new double[]{lng, lat}).build())
                .properties(properties)
                .build();
    }
}
