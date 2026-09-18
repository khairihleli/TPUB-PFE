package com.example.zelqanepfe.config;

import com.example.zelqanepfe.service.pricing.PricingCalculator;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Round-2 lane L3 settings (docs/round2-contract.md §4.1): polygon limits, heatmap range and dynamic pricing.
 * One class per prefix, both registered by {@link GeoPricingConfig}. Defaults live here (no YAML override).
 */
public final class GeoPricingProperties {

    private GeoPricingProperties() {
    }

    /** {@code zelqane.geo}: polygon validation limits and heatmap range. */
    @Data
    @ConfigurationProperties(prefix = "zelqane.geo")
    public static class Geo {

        private Polygon polygon = new Polygon();
        private Heatmap heatmap = new Heatmap();

        @Data
        public static class Polygon {
            /** Per ring, closing point excluded. */
            private int maxVertices = 100;
            private int maxTotalVertices = 200;
            /** Parts of a MultiPolygon. */
            private int maxParts = 5;
            /** Holes per polygon. */
            private int maxHoles = 5;
            private double minAreaKm2 = 0.01;
            private double maxAreaKm2 = 2000;
            /** Circumscribed radius from the centroid. */
            private double maxRadiusKm = 50;
        }

        @Data
        public static class Heatmap {
            private long maxRangeDays = 366;
        }
    }

    /** {@code zelqane.pricing.dynamic}: multipliers of the dynamic pricing (§4.6). */
    @Data
    @ConfigurationProperties(prefix = "zelqane.pricing.dynamic")
    public static class Dynamic implements InitializingBean {

        /** Also read from {@code ZELQANE_DYNAMIC_PRICING_ENABLED} by {@link GeoPricingConfig}. */
        private boolean enabled = true;
        private BigDecimal minMultiplier = new BigDecimal("0.70");
        private BigDecimal maxMultiplier = new BigDecimal("1.60");
        private List<HourBand> hourBands = new ArrayList<>(List.of(
                new HourBand("00:00", "07:00", new BigDecimal("0.70"), "Nuit"),
                new HourBand("07:00", "10:00", new BigDecimal("1.15"), "Pointe du matin"),
                new HourBand("10:00", "16:00", new BigDecimal("1.00"), "Journée"),
                new HourBand("16:00", "20:00", new BigDecimal("1.25"), "Pointe du soir"),
                new HourBand("20:00", "24:00", new BigDecimal("0.90"), "Soirée")));
        private Map<DayOfWeek, BigDecimal> dayMultipliers = defaultDays();
        private BigDecimal demandWeight = new BigDecimal("0.30");
        /** Weight of the support occupancy in the demand factor (the zone gets 1 − share). */
        private BigDecimal demandSupportShare = new BigDecimal("0.60");
        private BigDecimal scarcityWeight = new BigDecimal("0.20");

        @Data
        @NoArgsConstructor
        @AllArgsConstructor
        public static class HourBand {
            /** {@code HH:mm}. */
            private String start;
            /** {@code HH:mm}, {@code 24:00} allowed. */
            private String end;
            private BigDecimal multiplier;
            private String label;
        }

        private static Map<DayOfWeek, BigDecimal> defaultDays() {
            Map<DayOfWeek, BigDecimal> days = new EnumMap<>(DayOfWeek.class);
            days.put(DayOfWeek.MONDAY, new BigDecimal("1.00"));
            days.put(DayOfWeek.TUESDAY, new BigDecimal("1.00"));
            days.put(DayOfWeek.WEDNESDAY, new BigDecimal("1.00"));
            days.put(DayOfWeek.THURSDAY, new BigDecimal("1.00"));
            days.put(DayOfWeek.FRIDAY, new BigDecimal("1.05"));
            days.put(DayOfWeek.SATURDAY, new BigDecimal("1.15"));
            days.put(DayOfWeek.SUNDAY, new BigDecimal("0.90"));
            return days;
        }

        /** Fails startup when the bands do not cover 00:00–24:00 exactly once or the bounds are inconsistent. */
        @Override
        public void afterPropertiesSet() {
            PricingCalculator.bands(this);
            if (minMultiplier == null || maxMultiplier == null || minMultiplier.signum() <= 0
                    || minMultiplier.compareTo(maxMultiplier) > 0) {
                throw new IllegalStateException(
                        "zelqane.pricing.dynamic: min-multiplier doit être > 0 et ≤ max-multiplier.");
            }
        }
    }
}
