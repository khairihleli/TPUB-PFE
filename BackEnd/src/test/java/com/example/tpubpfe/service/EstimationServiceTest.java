package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class EstimationServiceTest {

    private final EstimationService service = new EstimationService(new TpubProperties(),
            mock(DiffusionSupportRepository.class), mock(ReservationRepository.class), mock(CampaignAccessGuard.class));

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
                .isEqualTo(new EstimationService.Estimate(20, new BigDecimal("0.06")));
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
}
