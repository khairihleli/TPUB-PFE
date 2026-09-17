package com.example.tpubpfe.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class GeoUtilsTest {

    @Test
    void distanceBetweenTunisAndSfaxIsAbout230Km() {
        double km = GeoUtils.distanceKm(36.8065, 10.1815, 34.7406, 10.7603);
        assertThat(km).isCloseTo(236.0, within(5.0));
    }

    @Test
    void zeroDistanceAndRadiusBoundary() {
        assertThat(GeoUtils.distanceKm(36.8, 10.18, 36.8, 10.18)).isZero();
        // ~1.11 km per 0.01° of latitude
        assertThat(GeoUtils.within(36.81, 10.18, 36.80, 10.18, 1.2)).isTrue();
        assertThat(GeoUtils.within(36.81, 10.18, 36.80, 10.18, 1.0)).isFalse();
    }
}
