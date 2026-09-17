package com.example.tpubpfe.service;

import com.example.tpubpfe.config.GeoPricingProperties;
import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.SupportAvailabilityRepository;
import com.example.tpubpfe.service.pricing.DynamicPricingService;
import com.example.tpubpfe.model.Reservation;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EstimationServiceTest {

    private final GeoPricingProperties.Dynamic dynamic = new GeoPricingProperties.Dynamic();
    private final ReservationRepository reservationRepository = mock(ReservationRepository.class);
    private final SupportAvailabilityRepository blockRepository = mock(SupportAvailabilityRepository.class);
    private final DiffusionSupportRepository supportRepository = mock(DiffusionSupportRepository.class);
    private final EstimationService service = new EstimationService(new TpubProperties(), supportRepository,
            reservationRepository, mock(CampaignAccessGuard.class),
            new DynamicPricingService(dynamic, reservationRepository, blockRepository, supportRepository));

    {
        // R1 formula tests: the dynamic pricing is covered below and in PricingCalculatorTest.
        dynamic.setEnabled(false);
    }

    private static DiffusionSupport support(SupportType type, String visibility, int capacity) {
        return DiffusionSupport.builder().id(1L).name("P").supportType(type)
                .zone(Zone.builder().id(1L).name("Z").build())
                .visibilityScore(visibility == null ? null : new BigDecimal(visibility))
                .diffusionCapacity((short) capacity).build();
    }

    private static TimeWindow window(int days, LocalTime start, LocalTime end) {
        LocalDate from = LocalDate.of(2026, 10, 1);
        return new TimeWindow(from, from.plusDays(days - 1L), start, end);
    }

    @Test
    void screenWithoutVisibilityScore() {
        // 120 views/h × 1.0 × 9 h × 5 days / 1 = 5400 ; 5400 × 8 / 1000 = 43.20
        EstimationService.Estimate estimate = service.estimate(support(SupportType.ECRAN, null, 1),
                window(5, LocalTime.of(9, 0), LocalTime.of(18, 0)));
        assertThat(estimate.views()).isEqualTo(5400);
        assertThat(estimate.cost()).isEqualByComparingTo("43.20");
    }

    @Test
    void visibilityFactorCapacityAndFractionalHoursAreApplied() {
        // 90 × (0.5 + 75/100 = 1.25) × 7.5 h × 3 days / 2 = 1265.625 → floor 1265 ; 1265 × 6 / 1000 = 7.59
        EstimationService.Estimate estimate = service.estimate(support(SupportType.PANNEAU_NUMERIQUE, "75", 2),
                window(3, LocalTime.of(8, 30), LocalTime.of(16, 0)));
        assertThat(estimate.views()).isEqualTo(1265);
        assertThat(estimate.cost()).isEqualByComparingTo("7.59");
    }

    @Test
    void zeroVisibilityHalvesAudienceAndCostIsRoundedHalfUp() {
        // 40 × 0.5 × 1 h × 1 day = 20 ; 20 × 3 / 1000 = 0.06
        assertThat(service.estimate(support(SupportType.POINT_WIFI, "0", 1), window(1, LocalTime.of(10, 0), LocalTime.of(11, 0))))
                .satisfies(e -> {
                    assertThat(e.views()).isEqualTo(20);
                    assertThat(e.cost()).isEqualByComparingTo("0.06");
                    assertThat(e.baseCost()).isEqualByComparingTo("0.06");
                    assertThat(e.breakdown().isEnabled()).isFalse();
                });
        // 250 × 1.5 × 1 h × 1 = 375 ; 375 × 3.5 / 1000 = 1.3125 → 1.31
        EstimationService.Estimate web = service.estimate(support(SupportType.SITE_WEB, "100", 1),
                window(1, LocalTime.of(10, 0), LocalTime.of(11, 0)));
        assertThat(web.views()).isEqualTo(375);
        assertThat(web.cost()).isEqualByComparingTo("1.31");
    }

    @Test
    void unitCostHasFourDecimals() {
        assertThat(service.unitCost(support(SupportType.ECRAN, null, 1))).isEqualByComparingTo("0.0080");
        assertThat(service.unitCost(support(SupportType.SITE_WEB, null, 1))).isEqualByComparingTo("0.0035");
        assertThat(service.unitCost(support(SupportType.SITE_WEB, null, 1)).scale()).isEqualTo(4);
    }

    @Test
    void timeWindowHelpers() {
        TimeWindow a = window(3, LocalTime.of(8, 0), LocalTime.of(12, 0));
        assertThat(a.days()).isEqualTo(3);
        assertThat(a.hoursPerDay()).isEqualTo(4.0);
        assertThat(a.overlaps(a.withTimes(LocalTime.of(12, 0), LocalTime.of(14, 0)))).isFalse();
        assertThat(a.overlaps(a.withTimes(LocalTime.of(11, 59), LocalTime.of(14, 0)))).isTrue();
        assertThat(a.overlaps(a.shiftDays(3))).isFalse();
        assertThat(a.overlaps(a.shiftDays(2))).isTrue();
    }

    @Test
    void dynamicCostAppliesTheMultiplierAndFreezesTheBaseCost() {
        dynamic.setEnabled(true);
        Zone zone = Zone.builder().id(1L).name("Z").build();
        DiffusionSupport screen = support(SupportType.ECRAN, null, 1);
        screen.setZone(zone);
        when(supportRepository.findAll()).thenReturn(List.of(screen));
        when(reservationRepository.findByStatusesOverlappingDates(any(), any(), any())).thenReturn(List.of());
        when(blockRepository.findByAvailabilityDateBetween(any(), any())).thenReturn(List.of());
        // Thursday 2026-10-01, 16:00–20:00: evening peak ×1.25, Thursday ×1.00, empty network, 1 support free
        // 120 × 4 h = 480 views ; 480 × 8 / 1000 = 3.84 ; × 1.25 = 4.80
        EstimationService.Estimate estimate = service.estimate(screen, window(1, LocalTime.of(16, 0), LocalTime.of(20, 0)));
        assertThat(estimate.views()).isEqualTo(480);
        assertThat(estimate.baseCost()).isEqualByComparingTo("3.84");
        assertThat(estimate.multiplier()).isEqualByComparingTo("1.25");
        assertThat(estimate.cost()).isEqualByComparingTo("4.80");
        assertThat(estimate.breakdown().getExplanations()).first().isEqualTo("Créneau en pointe du soir : ×1,25");
    }

    @Test
    void unitCostUnderAReservationUsesItsMultiplier() {
        DiffusionSupport screen = support(SupportType.ECRAN, null, 1);
        assertThat(service.unitCost(screen, Reservation.builder().priceMultiplier(new BigDecimal("1.1800")).build()))
                .isEqualByComparingTo("0.0094");
        assertThat(service.unitCost(screen, Reservation.builder().priceMultiplier(null).build())).isEqualByComparingTo("0.0080");
        assertThat(service.unitCost(screen, null)).isEqualByComparingTo("0.0080");
    }
}
