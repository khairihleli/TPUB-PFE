package com.example.zelqanepfe.service.pricing;

import com.example.zelqanepfe.config.GeoPricingProperties;
import com.example.zelqanepfe.dto.PriceBreakdown;
import com.example.zelqanepfe.dto.PricingConfigResponse;
import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import com.example.zelqanepfe.service.AvailabilityRules;
import com.example.zelqanepfe.service.TimeWindow;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Dynamic pricing (docs/round2-contract.md §4.6): loads the reservations, blocks and ACTIF supports once per window
 * ({@link Context}) and delegates the arithmetic to {@link PricingCalculator}.
 */
@Service
@RequiredArgsConstructor
public class DynamicPricingService {

    private final GeoPricingProperties.Dynamic config;
    private final ReservationRepository reservationRepository;
    private final SupportAvailabilityRepository blockRepository;
    private final DiffusionSupportRepository supportRepository;

    /**
     * Network snapshot of one window. Build it once per request and reuse it for every support of that window.
     * {@code zoneFigures} caches the per-zone occupancy and availability.
     */
    public record Context(TimeWindow window, Long excludeCampaignId, boolean enabled,
                          Map<Long, List<Reservation>> reservations, Map<Long, List<SupportAvailability>> blocks,
                          Map<Long, List<DiffusionSupport>> activeSupportsByZone, Map<Long, ZoneFigures> zoneFigures) {
    }

    public record ZoneFigures(PricingCalculator.Occupancy occupancy, double availability) {
    }

    public boolean enabled() {
        return config.isEnabled();
    }

    /** Loads the snapshot of {@code window} (nothing when pricing is disabled). */
    public Context context(TimeWindow window, Long excludeCampaignId) {
        if (!config.isEnabled()) {
            return new Context(window, excludeCampaignId, false, Map.of(), Map.of(), Map.of(), new HashMap<>());
        }
        Map<Long, List<Reservation>> reservations = reservationRepository
                .findByStatusesOverlappingDates(AvailabilityRules.LIVE, window.startDate(), window.endDate()).stream()
                .collect(Collectors.groupingBy(r -> r.getSupport().getId()));
        Map<Long, List<SupportAvailability>> blocks = blockRepository
                .findByAvailabilityDateBetween(window.startDate(), window.endDate()).stream()
                .collect(Collectors.groupingBy(b -> b.getSupport().getId()));
        Map<Long, List<DiffusionSupport>> activeByZone = supportRepository.findAll().stream()
                .filter(s -> s.getTechnicalStatus() == TechnicalStatus.ACTIF && s.getZone() != null)
                .collect(Collectors.groupingBy(s -> s.getZone().getId()));
        return new Context(window, excludeCampaignId, true, reservations, blocks, activeByZone, new HashMap<>());
    }

    /** Price of {@code support} on the context window, {@code baseCost} being the R1 cost. */
    public PriceBreakdown price(DiffusionSupport support, BigDecimal baseCost, Context context) {
        if (!context.enabled() || !config.isEnabled()) {
            return PricingCalculator.disabled(baseCost);
        }
        TimeWindow window = context.window();
        PricingCalculator.Occupancy supportOccupancy = PricingCalculator.occupancy(support,
                context.reservations().getOrDefault(support.getId(), List.of()), window, context.excludeCampaignId());
        ZoneFigures zone = support.getZone() == null
                ? new ZoneFigures(new PricingCalculator.Occupancy(0, 0), 1)
                : context.zoneFigures().computeIfAbsent(support.getZone().getId(), id -> zoneFigures(id, context));
        return PricingCalculator.price(config, PricingCalculator.bands(config), baseCost, window,
                new PricingCalculator.Demand(supportOccupancy.ratio(), zone.occupancy().ratio(), zone.availability()));
    }

    static ZoneFigures zoneFigures(Long zoneId, Context context) {
        List<DiffusionSupport> supports = context.activeSupportsByZone().getOrDefault(zoneId, List.of());
        PricingCalculator.Occupancy total = new PricingCalculator.Occupancy(0, 0);
        int available = 0;
        for (DiffusionSupport support : supports) {
            List<Reservation> reservations = context.reservations().getOrDefault(support.getId(), List.of());
            total = total.plus(PricingCalculator.occupancy(support, reservations, context.window(),
                    context.excludeCampaignId()));
            AvailabilityRules.Result result = AvailabilityRules.derive(support, context.window(), reservations,
                    context.blocks().getOrDefault(support.getId(), List.of()), context.excludeCampaignId());
            if (result.status() == AvailabilityStatus.DISPONIBLE) {
                available++;
            }
        }
        double availability = supports.isEmpty() ? 1 : (double) available / supports.size();
        return new ZoneFigures(total, availability);
    }

    public PricingConfigResponse config() {
        Map<String, BigDecimal> days = new LinkedHashMap<>();
        for (DayOfWeek day : DayOfWeek.values()) {
            days.put(PricingCalculator.dayCode(day), PricingCalculator.dayMultiplier(config.getDayMultipliers(), day));
        }
        return PricingConfigResponse.builder()
                .enabled(config.isEnabled())
                .minMultiplier(config.getMinMultiplier())
                .maxMultiplier(config.getMaxMultiplier())
                .hourBands(PricingCalculator.bands(config).stream()
                        .map(band -> PricingConfigResponse.HourBand.builder()
                                .start(hhmm(band.startSecond()))
                                .end(hhmm(band.endSecond()))
                                .multiplier(band.multiplier())
                                .label(band.label())
                                .build())
                        .toList())
                .dayMultipliers(days)
                .demandWeight(config.getDemandWeight())
                .scarcityWeight(config.getScarcityWeight())
                .build();
    }

    static String hhmm(int seconds) {
        return String.format("%02d:%02d", seconds / 3600, (seconds % 3600) / 60);
    }
}
