package com.example.zelqanepfe.service.pricing;

import com.example.zelqanepfe.config.GeoPricingProperties;
import com.example.zelqanepfe.dto.PriceBreakdown;
import com.example.zelqanepfe.dto.PricingConfigResponse;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import com.example.zelqanepfe.service.TimeWindow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DynamicPricingServiceTest {

    /** Thursday, 10:00–16:00 (Journée ×1.00, Thursday ×1.00): only demand and scarcity move the price. */
    private static final TimeWindow WINDOW = new TimeWindow(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1),
            LocalTime.of(10, 0), LocalTime.of(16, 0));

    private final Zone zone = Zone.builder().id(1L).name("Tunis Centre").build();
    private final DiffusionSupport a = support(1L, TechnicalStatus.ACTIF);
    private final DiffusionSupport b = support(2L, TechnicalStatus.ACTIF);
    private final DiffusionSupport c = support(3L, TechnicalStatus.MAINTENANCE);
    private final GeoPricingProperties.Dynamic config = new GeoPricingProperties.Dynamic();
    private ReservationRepository reservationRepository;
    private DynamicPricingService service;

    private DiffusionSupport support(long id, TechnicalStatus status) {
        return DiffusionSupport.builder().id(id).zone(zone).technicalStatus(status).diffusionCapacity((short) 1).build();
    }

    @BeforeEach
    void setUp() {
        reservationRepository = mock(ReservationRepository.class);
        SupportAvailabilityRepository blockRepository = mock(SupportAvailabilityRepository.class);
        DiffusionSupportRepository supportRepository = mock(DiffusionSupportRepository.class);
        service = new DynamicPricingService(config, reservationRepository, blockRepository, supportRepository);
        when(supportRepository.findAll()).thenReturn(List.of(a, b, c));
        when(blockRepository.findByAvailabilityDateBetween(any(), any())).thenReturn(List.of());
        Reservation onB = Reservation.builder().id(50L).support(b).campaign(Campaign.builder().id(5L).build())
                .reservationStatus(ReservationStatus.CONFIRMEE).startDate(WINDOW.startDate()).endDate(WINDOW.endDate())
                .startTime(LocalTime.of(10, 0)).endTime(LocalTime.of(16, 0)).build();
        when(reservationRepository.findByStatusesOverlappingDates(any(), any(), any())).thenReturn(List.of(onB));
    }

    @Test
    void demandAndScarcityComeFromTheZoneOfTheSupport() {
        DynamicPricingService.Context context = service.context(WINDOW, null);
        PriceBreakdown free = service.price(a, new BigDecimal("10.00"), context);
        // occS 0, occZ = 360 / 720 = 0.5 (maintenance support excluded) → demand 1 + 0.3 × 0.4 × 0.5 = 1.06
        // availability 1 / 2 → scarcity 1.10 ; 1.06 × 1.10 = 1.166
        assertThat(free.getDetails().getZoneOccupancy()).isEqualByComparingTo("0.5");
        assertThat(free.getFactors().getDemand()).isEqualByComparingTo("1.06");
        assertThat(free.getFactors().getScarcity()).isEqualByComparingTo("1.10");
        assertThat(free.getMultiplier()).isEqualByComparingTo("1.166");
        assertThat(free.getFinalCost()).isEqualByComparingTo("11.66");

        PriceBreakdown booked = service.price(b, new BigDecimal("10.00"), context);
        // occS 1 → demand 1 + 0.3 × (0.6 + 0.2) = 1.24 ; × 1.10 = 1.364
        assertThat(booked.getMultiplier()).isEqualByComparingTo("1.364");
    }

    @Test
    void theCampaignBeingPricedIsExcluded() {
        DynamicPricingService.Context context = service.context(WINDOW, 5L);
        PriceBreakdown price = service.price(b, new BigDecimal("10.00"), context);
        assertThat(price.getMultiplier()).isEqualByComparingTo("1");
        assertThat(price.getDetails().getZoneAvailability()).isEqualByComparingTo("1");
    }

    @Test
    void disabledPricingLoadsNothing() {
        config.setEnabled(false);
        DynamicPricingService.Context context = service.context(WINDOW, null);
        assertThat(service.price(a, new BigDecimal("3.84"), context).getFinalCost()).isEqualByComparingTo("3.84");
        verify(reservationRepository, never()).findByStatusesOverlappingDates(any(), any(), any());
    }

    @Test
    void configExposesBandsAndFrenchDays() {
        PricingConfigResponse response = service.config();
        assertThat(response.isEnabled()).isTrue();
        assertThat(response.getHourBands()).hasSize(5).last()
                .satisfies(band -> {
                    assertThat(band.getStart()).isEqualTo("20:00");
                    assertThat(band.getEnd()).isEqualTo("24:00");
                    assertThat(band.getLabel()).isEqualTo("Soirée");
                });
        assertThat(response.getDayMultipliers()).containsOnlyKeys("LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI",
                "SAMEDI", "DIMANCHE");
        assertThat(response.getDayMultipliers().get("SAMEDI")).isEqualByComparingTo("1.15");
    }
}
