package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.CampaignEstimateResponse;
import com.example.tpubpfe.dto.EstimateRequest;
import com.example.tpubpfe.dto.EstimateResponse;
import com.example.tpubpfe.dto.PriceBreakdown;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.service.pricing.DynamicPricingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Views and cost estimation (contract §2.6). The constants are internal simulation values ({@code tpub.pricing}).
 * Round 2 (docs/round2-contract.md §4.6): the cost is the dynamic {@code finalCost}; the R1 cost is the base cost.
 */
@Service
@RequiredArgsConstructor
public class EstimationService {

    static final Set<ReservationStatus> LIVE = Set.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);
    private static final BigDecimal THOUSAND = BigDecimal.valueOf(1000);
    private static final BigDecimal SIXTY = BigDecimal.valueOf(60);

    private final TpubProperties properties;
    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final CampaignAccessGuard accessGuard;
    private final DynamicPricingService pricingService;

    /**
     * @param cost      dynamic final cost (R1 cost when pricing is disabled)
     * @param breakdown price breakdown ({@code breakdown.baseCost} = R1 cost), null for a base estimate
     */
    public record Estimate(long views, BigDecimal cost, PriceBreakdown breakdown) {

        public BigDecimal baseCost() {
            return breakdown != null ? breakdown.getBaseCost() : cost;
        }

        public BigDecimal multiplier() {
            return breakdown != null ? breakdown.getMultiplier() : BigDecimal.ONE;
        }
    }

    /** Estimated views and dynamic cost of one support over a window (no campaign excluded from occupancy). */
    public Estimate estimate(DiffusionSupport support, TimeWindow window) {
        return estimate(support, window, (Long) null);
    }

    /** Same, excluding the reservations of {@code excludeCampaignId} from occupancy and availability. */
    public Estimate estimate(DiffusionSupport support, TimeWindow window, Long excludeCampaignId) {
        return estimate(support, window, pricingService.context(window, excludeCampaignId));
    }

    /** Same with a preloaded pricing snapshot of {@code window} (reuse it for many supports). */
    public Estimate estimate(DiffusionSupport support, TimeWindow window, DynamicPricingService.Context context) {
        Estimate base = baseEstimate(support, window);
        PriceBreakdown breakdown = pricingService.price(support, base.cost(), context);
        return new Estimate(base.views(), breakdown.getFinalCost(), breakdown);
    }

    public DynamicPricingService.Context pricingContext(TimeWindow window, Long excludeCampaignId) {
        return pricingService.context(window, excludeCampaignId);
    }

    /** R1 estimate: views and {@code views × cpm / 1000}, without dynamic pricing (breakdown null). */
    public Estimate baseEstimate(DiffusionSupport support, TimeWindow window) {
        long minutes = Math.max(0, window.minutesPerDay());
        long days = Math.max(0, window.days());
        BigDecimal base = BigDecimal.valueOf(baseViewsPerHour(support.getSupportType()));
        int capacity = Math.max(1, support.getDiffusionCapacity() == null ? 1 : support.getDiffusionCapacity());
        BigDecimal views = base.multiply(visibilityFactor(support.getVisibilityScore()))
                .multiply(BigDecimal.valueOf(minutes))
                .multiply(BigDecimal.valueOf(days))
                .divide(SIXTY.multiply(BigDecimal.valueOf(capacity)), 10, RoundingMode.HALF_UP)
                .setScale(0, RoundingMode.FLOOR);
        long viewCount = views.longValueExact();
        return new Estimate(viewCount, cost(support.getSupportType(), viewCount), null);
    }

    /** {@code round(views × cpm / 1000, 2, HALF_UP)}. */
    public BigDecimal cost(SupportType type, long views) {
        return BigDecimal.valueOf(views).multiply(cpm(type)).divide(THOUSAND, 2, RoundingMode.HALF_UP);
    }

    /** Cost of one diffusion: {@code round(cpm / 1000, 4, HALF_UP)} (multiplier 1). */
    public BigDecimal unitCost(DiffusionSupport support) {
        return cpm(support.getSupportType()).divide(THOUSAND, 4, RoundingMode.HALF_UP);
    }

    /** Cost of one diffusion under a reservation: {@code round(R1 unit cost × priceMultiplier, 4, HALF_UP)}. */
    public BigDecimal unitCost(DiffusionSupport support, Reservation reservation) {
        BigDecimal multiplier = reservation == null || reservation.getPriceMultiplier() == null
                ? BigDecimal.ONE : reservation.getPriceMultiplier();
        return cpm(support.getSupportType()).multiply(multiplier).divide(THOUSAND, 4, RoundingMode.HALF_UP);
    }

    static BigDecimal visibilityFactor(BigDecimal visibilityScore) {
        if (visibilityScore == null) {
            return BigDecimal.ONE;
        }
        return new BigDecimal("0.5").add(visibilityScore.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
    }

    int baseViewsPerHour(SupportType type) {
        Integer value = properties.getPricing().getBaseViewsPerHour().get(type);
        return value == null ? 0 : value;
    }

    BigDecimal cpm(SupportType type) {
        BigDecimal value = properties.getPricing().getCpmTnd().get(type);
        return value == null ? BigDecimal.ZERO : value;
    }

    @Transactional(readOnly = true)
    public EstimateResponse compute(EstimateRequest request) {
        TimeWindow window = validatedWindow(request);
        List<Long> ids = new ArrayList<>(new LinkedHashSet<>(request.getSupportIds()));
        Map<Long, DiffusionSupport> supports = supportRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(DiffusionSupport::getId, Function.identity()));
        List<EstimateResponse.Line> lines = new ArrayList<>();
        DynamicPricingService.Context context = null;
        for (Long id : ids) {
            DiffusionSupport support = supports.get(id);
            if (support == null) {
                throw NetworkErrors.supportNotFound();
            }
            if (context == null) {
                context = pricingService.context(window, request.getCampaignId());
            }
            Estimate estimate = estimate(support, window, context);
            lines.add(EstimateResponse.Line.builder()
                    .supportId(support.getId())
                    .supportName(support.getName())
                    .supportType(support.getSupportType().name())
                    .zoneName(support.getZone().getName())
                    .estimatedViews(estimate.views())
                    .estimatedCost(estimate.cost())
                    .baseCost(estimate.baseCost())
                    .pricing(estimate.breakdown())
                    .build());
        }
        return EstimateResponse.builder()
                .days(window.days())
                .hoursPerDay(window.hoursPerDay())
                .lines(lines)
                .totalViews(lines.stream().mapToLong(EstimateResponse.Line::getEstimatedViews).sum())
                .totalCost(lines.stream().map(EstimateResponse.Line::getEstimatedCost).reduce(BigDecimal.ZERO, BigDecimal::add))
                .totalBaseCost(lines.stream().map(EstimateResponse.Line::getBaseCost).reduce(BigDecimal.ZERO, BigDecimal::add))
                .build();
    }

    @Transactional(readOnly = true)
    public CampaignEstimateResponse campaign(Long campaignId) {
        Campaign campaign = accessGuard.readable(campaignId);
        List<CampaignEstimateResponse.Line> lines = reservationRepository.findByCampaignId(campaign.getId()).stream()
                .filter(r -> LIVE.contains(r.getReservationStatus()))
                .sorted(Comparator.comparing(Reservation::getStartDate).thenComparing(Reservation::getId))
                .map(r -> CampaignEstimateResponse.Line.builder()
                        .reservationId(r.getId())
                        .supportId(r.getSupport().getId())
                        .supportName(r.getSupport().getName())
                        .zoneName(r.getZone().getName())
                        .reservationStatus(r.getReservationStatus().name())
                        .startDate(r.getStartDate())
                        .endDate(r.getEndDate())
                        .startTime(r.getStartTime())
                        .endTime(r.getEndTime())
                        .estimatedViews(r.getEstimatedViews() == null ? 0 : r.getEstimatedViews())
                        .estimatedCost(r.getEstimatedCost() == null ? BigDecimal.ZERO : r.getEstimatedCost())
                        .baseCost(r.getBaseCost() != null ? r.getBaseCost()
                                : (r.getEstimatedCost() == null ? BigDecimal.ZERO : r.getEstimatedCost()))
                        .priceMultiplier(r.getPriceMultiplier() == null ? BigDecimal.ONE : r.getPriceMultiplier())
                        .pricing(r.getPricingBreakdown())
                        .build())
                .toList();
        BigDecimal budget = campaign.getBudget() == null ? BigDecimal.ZERO : campaign.getBudget();
        BigDecimal consumed = campaign.getConsumedBudget() == null ? BigDecimal.ZERO : campaign.getConsumedBudget();
        BigDecimal totalCost = lines.stream().map(CampaignEstimateResponse.Line::getEstimatedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return CampaignEstimateResponse.builder()
                .campaignId(campaign.getId())
                .budget(budget)
                .consumedBudget(consumed)
                .remainingBudget(budget.subtract(consumed).max(BigDecimal.ZERO))
                .lines(lines)
                .totalViews(lines.stream().mapToLong(CampaignEstimateResponse.Line::getEstimatedViews).sum())
                .totalCost(totalCost)
                .budgetCoverage(totalCost.signum() == 0 ? null : budget.divide(totalCost, 4, RoundingMode.HALF_UP))
                .budgetSufficient(budget.compareTo(totalCost) >= 0)
                .build();
    }

    private static TimeWindow validatedWindow(EstimateRequest request) {
        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        if (!request.getStartTime().isBefore(request.getEndTime())) {
            throw NetworkErrors.invalidTimeRange();
        }
        return new TimeWindow(request.getStartDate(), request.getEndDate(), request.getStartTime(), request.getEndTime());
    }
}
