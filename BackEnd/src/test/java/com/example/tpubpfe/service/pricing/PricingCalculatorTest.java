package com.example.tpubpfe.service.pricing;

import com.example.tpubpfe.config.GeoPricingProperties;
import com.example.tpubpfe.dto.PriceBreakdown;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.service.TimeWindow;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PricingCalculatorTest {

    /** Thursday. */
    private static final LocalDate THU = LocalDate.of(2026, 10, 1);

    private final GeoPricingProperties.Dynamic config = new GeoPricingProperties.Dynamic();
    private final List<PricingCalculator.Band> bands = PricingCalculator.bands(config);

    private static TimeWindow window(LocalDate start, LocalDate end, int startHour, int endHour) {
        return new TimeWindow(start, end, LocalTime.of(startHour, 0), endHour == 24 ? LocalTime.of(23, 59, 59)
                : LocalTime.of(endHour, 0));
    }

    @Test
    void hourFactorIsTheTimeWeightedMeanOfTheBands() {
        PricingCalculator.HourFactor hour = PricingCalculator.hourFactor(bands, LocalTime.of(9, 0), LocalTime.of(18, 0));
        // (60 × 1.15 + 360 × 1.00 + 120 × 1.25) / 540 = 1.07222…
        assertThat(hour.factor()).isEqualByComparingTo("1.0722");
        assertThat(hour.bands()).extracting(PriceBreakdown.HourBandDetail::getLabel, PriceBreakdown.HourBandDetail::getMinutes)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Pointe du matin", 60L),
                        org.assertj.core.groups.Tuple.tuple("Journée", 360L),
                        org.assertj.core.groups.Tuple.tuple("Pointe du soir", 120L));
        assertThat(PricingCalculator.hourFactor(bands, LocalTime.of(16, 0), LocalTime.of(20, 0)).factor())
                .isEqualByComparingTo("1.25");
    }

    @Test
    void dayFactorIsTheMeanOverEveryDate() {
        PricingCalculator.DayFactor day = PricingCalculator.dayFactor(config.getDayMultipliers(), THU, THU.plusDays(3));
        // (1.00 + 1.05 + 1.15 + 0.90) / 4
        assertThat(day.factor()).isEqualByComparingTo("1.0250");
        assertThat(day.days()).extracting(PriceBreakdown.DayDetail::getDayOfWeek)
                .containsExactly("JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE");
        PricingCalculator.DayFactor fifteen = PricingCalculator.dayFactor(config.getDayMultipliers(), THU, THU.plusDays(14));
        assertThat(fifteen.days()).filteredOn(d -> d.getDayOfWeek().equals("JEUDI")).singleElement()
                .extracting(PriceBreakdown.DayDetail::getCount).isEqualTo(3);
        assertThat(fifteen.days().stream().mapToInt(PriceBreakdown.DayDetail::getCount).sum()).isEqualTo(15);
    }

    private static Reservation booking(long campaignId, ReservationStatus status) {
        return Reservation.builder().campaign(Campaign.builder().id(campaignId).build()).reservationStatus(status)
                .startDate(THU.minusDays(3)).endDate(THU.plusDays(5))
                .startTime(LocalTime.of(11, 0)).endTime(LocalTime.of(13, 0)).build();
    }

    @Test
    void occupancyCountsOverlappingMinutesOfOtherLiveReservations() {
        DiffusionSupport support = DiffusionSupport.builder().id(1L).diffusionCapacity((short) 2).build();
        TimeWindow w = window(THU, THU.plusDays(1), 10, 12);
        Reservation other = booking(5L, ReservationStatus.CONFIRMEE);
        Reservation own = booking(9L, ReservationStatus.TEMPORAIRE);
        Reservation cancelled = booking(6L, ReservationStatus.ANNULEE);
        PricingCalculator.Occupancy occupancy = PricingCalculator.occupancy(support, List.of(other, own, cancelled), w, 9L);
        // 2 days × 60 min over capacity 2 × 2 days × 120 min
        assertThat(occupancy.reservedMinutes()).isEqualTo(120);
        assertThat(occupancy.capacityMinutes()).isEqualTo(480);
        assertThat(occupancy.ratio()).isEqualTo(0.25);
        assertThat(PricingCalculator.overlapMinutes(w, window(THU.plusDays(2), THU.plusDays(3), 10, 12))).isZero();
        assertThat(PricingCalculator.overlapMinutes(w, window(THU, THU, 12, 14))).isZero();
        assertThat(new PricingCalculator.Occupancy(900, 600).ratio()).isEqualTo(1.0);
    }

    @Test
    void fullPriceWithEveryFactorAndFrenchExplanations() {
        PriceBreakdown price = PricingCalculator.price(config, bands, new BigDecimal("100.00"),
                new TimeWindow(THU, THU.plusDays(3), LocalTime.of(9, 0), LocalTime.of(18, 0)),
                new PricingCalculator.Demand(0.5, 0.25, 0.5));
        // demand = 1 + 0.30 × (0.6 × 0.5 + 0.4 × 0.25) = 1.12 ; scarcity = 1 + 0.20 × 0.5 = 1.10
        assertThat(price.getFactors().getHour()).isEqualByComparingTo("1.0722");
        assertThat(price.getFactors().getDayOfWeek()).isEqualByComparingTo("1.0250");
        assertThat(price.getFactors().getDemand()).isEqualByComparingTo("1.12");
        assertThat(price.getFactors().getScarcity()).isEqualByComparingTo("1.10");
        // 1.0722 × 1.0250 × 1.12 × 1.10 = 1.35397… → 1.3540
        assertThat(price.getMultiplier()).isEqualByComparingTo("1.3540");
        assertThat(price.getMultiplier().scale()).isEqualTo(4);
        assertThat(price.getFinalCost()).isEqualByComparingTo("135.40");
        assertThat(price.getBaseCost()).isEqualByComparingTo("100.00");
        assertThat(price.isClamped()).isFalse();
        assertThat(price.isEnabled()).isTrue();
        assertThat(price.getDetails().getZoneAvailability()).isEqualByComparingTo("0.5");
        assertThat(price.getExplanations()).containsExactly(
                "Créneau sur plusieurs tranches (Pointe du matin, Journée, Pointe du soir) : ×1,07",
                "Jours de diffusion (moyenne sur 4 jours) : ×1,03",
                "Demande : Porteur occupé à 50 %, zone occupée à 25 % : ×1,12",
                "Disponibilité : 50 % des Porteurs de la zone libres : ×1,10");
    }

    @Test
    void multiplierIsClampedBothWays() {
        LocalDate saturday = THU.plusDays(2);
        PriceBreakdown peak = PricingCalculator.price(config, bands, new BigDecimal("10"),
                window(saturday, saturday, 16, 20), new PricingCalculator.Demand(1, 1, 0));
        // 1.25 × 1.15 × 1.30 × 1.20 = 2.2425 → 1.60
        assertThat(peak.getMultiplier()).isEqualByComparingTo("1.60");
        assertThat(peak.isClamped()).isTrue();
        assertThat(peak.getFinalCost()).isEqualByComparingTo("16.00");
        assertThat(peak.getExplanations()).first().isEqualTo("Créneau en pointe du soir : ×1,25");
        assertThat(peak.getExplanations()).contains("Diffusion le samedi : ×1,15", "Multiplicateur plafonné à ×1,60");

        LocalDate sunday = THU.plusDays(3);
        PriceBreakdown night = PricingCalculator.price(config, bands, new BigDecimal("10"),
                window(sunday, sunday, 0, 7), new PricingCalculator.Demand(0, 0, 1));
        // 0.70 × 0.90 = 0.63 → 0.70
        assertThat(night.getMultiplier()).isEqualByComparingTo("0.70");
        assertThat(night.isClamped()).isTrue();
        assertThat(night.getExplanations()).last().isEqualTo("Multiplicateur relevé au plancher de ×0,70");
    }

    @Test
    void disabledPricingKeepsTheBaseCost() {
        config.setEnabled(false);
        PriceBreakdown price = PricingCalculator.price(config, bands, new BigDecimal("12.345"),
                window(THU, THU, 16, 20), new PricingCalculator.Demand(1, 1, 0));
        assertThat(price.isEnabled()).isFalse();
        assertThat(price.getMultiplier()).isEqualByComparingTo("1");
        assertThat(price.getFinalCost()).isEqualByComparingTo("12.35");
        assertThat(price.getFactors().getDemand()).isEqualByComparingTo("1");
    }

    @Test
    void bandsMustCoverTheWholeDayWithoutOverlap() {
        GeoPricingProperties.Dynamic gap = new GeoPricingProperties.Dynamic();
        gap.getHourBands().remove(0);
        assertThatThrownBy(gap::afterPropertiesSet).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("00:00–24:00");
        GeoPricingProperties.Dynamic overlap = new GeoPricingProperties.Dynamic();
        overlap.getHourBands().get(1).setStart("06:00");
        assertThatThrownBy(overlap::afterPropertiesSet).isInstanceOf(IllegalStateException.class);
        GeoPricingProperties.Dynamic badTime = new GeoPricingProperties.Dynamic();
        badTime.getHourBands().get(4).setEnd("24:30");
        assertThatThrownBy(badTime::afterPropertiesSet).isInstanceOf(IllegalStateException.class);
        GeoPricingProperties.Dynamic bounds = new GeoPricingProperties.Dynamic();
        bounds.setMinMultiplier(new BigDecimal("2"));
        assertThatThrownBy(bounds::afterPropertiesSet).isInstanceOf(IllegalStateException.class);
        new GeoPricingProperties.Dynamic().afterPropertiesSet();
    }

    @Test
    void frenchFormatting() {
        assertThat(PricingCalculator.times(new BigDecimal("1.25"))).isEqualTo("×1,25");
        assertThat(PricingCalculator.times(new BigDecimal("1.1849"))).isEqualTo("×1,18");
        assertThat(PricingCalculator.percent(new BigDecimal("0.6412"))).isEqualTo("64 %");
    }

    @Test
    void environmentAliasEnablesOrDisablesThePricing() {
        GeoPricingProperties.Dynamic dynamic = new GeoPricingProperties.Dynamic();
        new com.example.tpubpfe.config.GeoPricingConfig(dynamic, new MockEnvironment()
                .withProperty("TPUB_DYNAMIC_PRICING_ENABLED", "false"));
        assertThat(dynamic.isEnabled()).isFalse();
        GeoPricingProperties.Dynamic explicit = new GeoPricingProperties.Dynamic();
        new com.example.tpubpfe.config.GeoPricingConfig(explicit, new MockEnvironment()
                .withProperty("TPUB_DYNAMIC_PRICING_ENABLED", "false")
                .withProperty("tpub.pricing.dynamic.enabled", "true"));
        assertThat(explicit.isEnabled()).isTrue();
    }
}
