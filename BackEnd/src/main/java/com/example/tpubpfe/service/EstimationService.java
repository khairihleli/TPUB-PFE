package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.CampaignEstimateResponse;
import com.example.tpubpfe.dto.EstimateRequest;
import com.example.tpubpfe.dto.EstimateResponse;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
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

    public record Estimate(long views, BigDecimal cost) {
    }

    /** Estimated views and cost of one support over a window. */
    public Estimate estimate(DiffusionSupport support, TimeWindow window) {
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
        return new Estimate(viewCount, cost(support.getSupportType(), viewCount));
    }

    /** {@code round(views × cpm / 1000, 2, HALF_UP)}. */
    public BigDecimal cost(SupportType type, long views) {
        return BigDecimal.valueOf(views).multiply(cpm(type)).divide(THOUSAND, 2, RoundingMode.HALF_UP);
    }

    /** Cost of one diffusion: {@code round(cpm / 1000, 4, HALF_UP)}. */
    public BigDecimal unitCost(DiffusionSupport support) {
        return cpm(support.getSupportType()).divide(THOUSAND, 4, RoundingMode.HALF_UP);
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
        for (Long id : ids) {
            DiffusionSupport support = supports.get(id);
            if (support == null) {
                throw NetworkErrors.supportNotFound();
            }
            Estimate estimate = estimate(support, window);
            lines.add(EstimateResponse.Line.builder()
                    .supportId(support.getId())
                    .supportName(support.getName())
                    .supportType(support.getSupportType().name())
                    .zoneName(support.getZone().getName())
                    .estimatedViews(estimate.views())
                    .estimatedCost(estimate.cost())
                    .build());
        }
        return EstimateResponse.builder()
                .days(window.days())
                .hoursPerDay(window.hoursPerDay())
                .lines(lines)
                .totalViews(lines.stream().mapToLong(EstimateResponse.Line::getEstimatedViews).sum())
                .totalCost(lines.stream().map(EstimateResponse.Line::getEstimatedCost).reduce(BigDecimal.ZERO, BigDecimal::add))
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
