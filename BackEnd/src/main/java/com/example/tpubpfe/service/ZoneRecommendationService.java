package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.ZoneRecommendationResponse;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.service.pricing.DynamicPricingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Best-zone recommendation for a window (contract §2.4): audience, availability and recent activity.
 */
@Service
@RequiredArgsConstructor
public class ZoneRecommendationService {

    static final int DEFAULT_LIMIT = 3;
    static final int MAX_LIMIT = 10;
    static final int RECENT_DAYS = 30;
    static final long DEFAULT_WINDOW_DAYS = 7;

    private final ZoneRepository zoneRepository;
    private final DiffusionSupportRepository supportRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final AvailabilityService availabilityService;
    private final EstimationService estimationService;
    private final Clock clock;

    /** Aggregated figures of one zone before scoring. */
    record ZoneFigures(Zone zone, long totalSupports, long availableSupports, long viewsAvailable,
                       BigDecimal costAvailable, double recentPerSupport) {
    }

    /**
     * Missing parameters default to: startDate = today, endDate = startDate + 6 days, times = JOURNEE preset.
     */
    @Transactional(readOnly = true)
    public List<ZoneRecommendationResponse> recommend(LocalDate startDate, LocalDate endDate, LocalTime startTime,
                                                      LocalTime endTime, List<SupportType> supportTypes, Integer limit) {
        LocalDate start = startDate != null ? startDate : LocalDate.now(clock);
        LocalDate end = endDate != null ? endDate : start.plusDays(DEFAULT_WINDOW_DAYS - 1);
        LocalTime st = startTime != null ? startTime : AvailabilityRules.Preset.JOURNEE.start;
        LocalTime et = endTime != null ? endTime : AvailabilityRules.Preset.JOURNEE.end;
        TimeWindow window = AvailabilityService.validateWindow(start, end, st, et);
        int max = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, limit));

        Map<Long, List<DiffusionSupport>> supportsByZone = supportRepository.findAll().stream()
                .filter(s -> supportTypes == null || supportTypes.isEmpty() || supportTypes.contains(s.getSupportType()))
                .collect(Collectors.groupingBy(s -> s.getZone().getId()));
        Map<Long, Long> recentBySupport = new HashMap<>();
        Instant since = LocalDate.now(clock).minusDays(RECENT_DAYS).atStartOfDay(clock.getZone()).toInstant();
        for (Object[] row : diffusionLogRepository.countPerSupportSince(DiffusionContentType.PUBLICITE, since)) {
            recentBySupport.put((Long) row[0], ((Number) row[1]).longValue());
        }

        AvailabilityService.Snapshot snapshot = availabilityService.load(window.startDate(), window.endDate());
        DynamicPricingService.Context pricing = estimationService.pricingContext(window, null);
        List<ZoneFigures> figures = new ArrayList<>();
        for (Zone zone : zoneRepository.findByIsActiveTrue()) {
            List<DiffusionSupport> supports = supportsByZone.getOrDefault(zone.getId(), List.of());
            long available = 0;
            long views = 0;
            BigDecimal cost = BigDecimal.ZERO;
            long recent = 0;
            for (DiffusionSupport support : supports) {
                recent += recentBySupport.getOrDefault(support.getId(), 0L);
                AvailabilityRules.Result result = AvailabilityRules.derive(support, window,
                        snapshot.reservationsOf(support.getId()), snapshot.blocksOf(support.getId()), null);
                if (result.status() == AvailabilityStatus.DISPONIBLE) {
                    available++;
                    EstimationService.Estimate estimate = estimationService.estimate(support, window, pricing);
                    views += estimate.views();
                    cost = cost.add(estimate.cost());
                }
            }
            double recentPerSupport = supports.isEmpty() ? 0 : (double) recent / supports.size();
            figures.add(new ZoneFigures(zone, supports.size(), available, views, cost, recentPerSupport));
        }
        return rank(figures, max);
    }

    static List<ZoneRecommendationResponse> rank(List<ZoneFigures> figures, int limit) {
        long maxViews = figures.stream().mapToLong(ZoneFigures::viewsAvailable).max().orElse(0);
        double maxRecent = figures.stream().mapToDouble(ZoneFigures::recentPerSupport).max().orElse(0);
        return figures.stream()
                .filter(f -> f.availableSupports() > 0)
                .map(f -> {
                    double viewsRatio = maxViews == 0 ? 0 : (double) f.viewsAvailable() / maxViews;
                    double availableRatio = f.totalSupports() == 0 ? 0 : (double) f.availableSupports() / f.totalSupports();
                    double recentRatio = maxRecent == 0 ? 0 : f.recentPerSupport() / maxRecent;
                    int score = (int) Math.round(50 * viewsRatio + 30 * availableRatio + 20 * recentRatio);
                    return ZoneRecommendationResponse.builder()
                            .zone(ZoneService.toResponse(f.zone()))
                            .score(score)
                            .totalSupports(f.totalSupports())
                            .availableSupports(f.availableSupports())
                            .estimatedViewsAvailable(f.viewsAvailable())
                            .estimatedCostAvailable(f.costAvailable())
                            .recentViewsPerSupport(BigDecimal.valueOf(f.recentPerSupport())
                                    .setScale(1, RoundingMode.HALF_UP).doubleValue())
                            .reasons(reasons(f, viewsRatio, recentRatio))
                            .build();
                })
                .sorted(Comparator.comparingInt(ZoneRecommendationResponse::getScore).reversed()
                        .thenComparing(r -> r.getZone().getName(), String.CASE_INSENSITIVE_ORDER))
                .limit(limit)
                .toList();
    }

    static List<String> reasons(ZoneFigures f, double viewsRatio, double recentRatio) {
        List<String> reasons = new ArrayList<>();
        reasons.add(f.availableSupports() + (f.availableSupports() > 1 ? " Porteurs disponibles sur " : " Porteur disponible sur ")
                + f.totalSupports());
        if (viewsRatio >= 0.999) {
            reasons.add("Meilleure audience estimée sur la période");
        } else if (viewsRatio >= 0.6) {
            reasons.add("Audience estimée élevée");
        }
        if (recentRatio >= 0.6) {
            reasons.add("Forte audience récente");
        } else if (f.recentPerSupport() == 0) {
            reasons.add("Zone peu sollicitée ces 30 derniers jours");
        }
        return reasons;
    }
}
