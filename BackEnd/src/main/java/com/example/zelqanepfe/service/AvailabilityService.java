package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AvailabilityResponse;
import com.example.zelqanepfe.dto.SupportAvailabilitySlot;
import com.example.zelqanepfe.dto.SupportResponse;
import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.CampaignZoneRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.service.pricing.DynamicPricingService;
import com.example.zelqanepfe.util.GeoUtils;
import com.example.zelqanepfe.util.TargetingGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Availability of supports over a window, with statuses, estimates and alternative slots (contract §2.4, §2.7).
 */
@Service
@RequiredArgsConstructor
public class AvailabilityService {

    static final long MAX_RANGE_DAYS = 366;
    static final int[] ALTERNATIVE_SHIFTS_DAYS = {7, 14, 21, 28};
    static final int MAX_ALTERNATIVES = 3;

    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final SupportAvailabilityRepository blockRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ZoneRepository zoneRepository;
    private final CampaignAccessGuard accessGuard;
    private final EstimationService estimationService;

    /** Reservations and blocks of every support over a date range, grouped by support id. */
    public record Snapshot(Map<Long, List<Reservation>> reservations, Map<Long, List<SupportAvailability>> blocks) {

        List<Reservation> reservationsOf(Long supportId) {
            return reservations.getOrDefault(supportId, List.of());
        }

        List<SupportAvailability> blocksOf(Long supportId) {
            return blocks.getOrDefault(supportId, List.of());
        }
    }

    /** A candidate support with its distance to the searched target (null when not meaningful). */
    public record Candidate(DiffusionSupport support, Double distanceKm) {
    }

    public record Query(LocalDate startDate, LocalDate endDate, LocalTime startTime, LocalTime endTime,
                        Long campaignId, Double latitude, Double longitude, Double radiusKm, Long zoneId,
                        List<SupportType> supportTypes, List<AvailabilityStatus> statuses) {
    }

    public Snapshot load(LocalDate from, LocalDate to) {
        Map<Long, List<Reservation>> reservations = reservationRepository
                .findByStatusesOverlappingDates(AvailabilityRules.LIVE, from, to).stream()
                .collect(Collectors.groupingBy(r -> r.getSupport().getId()));
        Map<Long, List<SupportAvailability>> blocks = blockRepository.findByAvailabilityDateBetween(from, to).stream()
                .collect(Collectors.groupingBy(b -> b.getSupport().getId()));
        return new Snapshot(reservations, blocks);
    }

    /** Status of a single support, loading only its own reservations and blocks. */
    public AvailabilityRules.Result deriveOne(DiffusionSupport support, TimeWindow window, Long campaignId) {
        List<Reservation> reservations = reservationRepository.findBookedPeriodsForSupport(support.getId(),
                window.startDate(), window.endDate(), List.copyOf(AvailabilityRules.LIVE));
        List<SupportAvailability> blocks = blockRepository
                .findBySupportIdAndAvailabilityDateBetweenOrderByAvailabilityDateAscStartTimeAsc(
                        support.getId(), window.startDate(), window.endDate());
        return AvailabilityRules.derive(support, window, reservations, blocks, campaignId);
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse search(Query query) {
        TimeWindow window = validateWindow(query.startDate(), query.endDate(), query.startTime(), query.endTime());
        Long campaignId = query.campaignId();
        List<Candidate> candidates = candidates(query).stream()
                .filter(c -> query.supportTypes() == null || query.supportTypes().isEmpty()
                        || query.supportTypes().contains(c.support().getSupportType()))
                .sorted(Comparator.comparing((Candidate c) -> c.distanceKm() == null ? Double.MAX_VALUE : c.distanceKm())
                        .thenComparing(c -> c.support().getName(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(c -> c.support().getId()))
                .toList();

        Snapshot snapshot = load(window.startDate(), window.endDate());
        DynamicPricingService.Context pricing = candidates.isEmpty() ? null
                : estimationService.pricingContext(window, campaignId);
        List<AvailabilityResponse.Item> items = new ArrayList<>();
        for (Candidate candidate : candidates) {
            items.add(item(candidate, window, snapshot, campaignId, pricing));
        }
        AvailabilityResponse.Summary summary = summary(items);
        List<AvailabilityResponse.AlternativeSlot> alternatives = summary.getAvailableSupports() == 0 && !candidates.isEmpty()
                ? alternatives(candidates, window, snapshot, campaignId)
                : List.of();

        List<AvailabilityResponse.Item> visible = query.statuses() == null || query.statuses().isEmpty()
                ? items
                : items.stream().filter(i -> query.statuses().contains(AvailabilityStatus.valueOf(i.getStatus()))).toList();

        return AvailabilityResponse.builder()
                .startDate(window.startDate())
                .endDate(window.endDate())
                .startTime(window.startTime())
                .endTime(window.endTime())
                .days(window.days())
                .hoursPerDay(window.hoursPerDay())
                .supports(visible)
                .summary(summary)
                .alternatives(alternatives)
                .build();
    }

    static TimeWindow validateWindow(LocalDate startDate, LocalDate endDate, LocalTime startTime, LocalTime endTime) {
        if (startDate == null) {
            throw NetworkErrors.missingParameter("startDate", "Paramètre obligatoire : startDate.");
        }
        if (endDate == null) {
            throw NetworkErrors.missingParameter("endDate", "Paramètre obligatoire : endDate.");
        }
        if (startTime == null) {
            throw NetworkErrors.missingParameter("startTime", "Paramètre obligatoire : startTime.");
        }
        if (endTime == null) {
            throw NetworkErrors.missingParameter("endTime", "Paramètre obligatoire : endTime.");
        }
        if (endDate.isBefore(startDate)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        TimeWindow window = new TimeWindow(startDate, endDate, startTime, endTime);
        if (window.days() > MAX_RANGE_DAYS) {
            throw NetworkErrors.invalidRange("La période ne peut pas dépasser 366 jours.");
        }
        if (!startTime.isBefore(endTime)) {
            throw NetworkErrors.invalidTimeRange();
        }
        return window;
    }

    List<Candidate> candidates(Query query) {
        boolean hasCircle = query.latitude() != null || query.longitude() != null || query.radiusKm() != null;
        int targets = (query.campaignId() != null ? 1 : 0) + (hasCircle ? 1 : 0) + (query.zoneId() != null ? 1 : 0);
        if (targets == 0) {
            throw NetworkErrors.missingParameter("target",
                    "Indiquez une cible : campaignId, ou lat + lng + radiusKm, ou zoneId.");
        }
        if (targets > 1) {
            throw CampaignErrors.invalidParameter("target",
                    "Une seule cible à la fois : campaignId, ou lat + lng + radiusKm, ou zoneId.");
        }
        if (query.campaignId() != null) {
            Campaign campaign = accessGuard.readable(query.campaignId());
            List<CampaignZone> zones = campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId());
            return inCircles(supportRepository.findAll(), zones);
        }
        if (hasCircle) {
            if (query.latitude() == null || query.longitude() == null || query.radiusKm() == null) {
                throw NetworkErrors.missingParameter("radiusKm", "Un cercle demande lat, lng et radiusKm.");
            }
            if (query.radiusKm() < 0.1 || query.radiusKm() > 50) {
                throw CampaignErrors.invalidParameter("radiusKm", "Le rayon doit être compris entre 0,1 et 50 km.");
            }
            List<Candidate> result = new ArrayList<>();
            for (DiffusionSupport support : supportRepository.findAll()) {
                double distance = distance(support, query.latitude(), query.longitude());
                if (distance <= query.radiusKm()) {
                    result.add(new Candidate(support, round(distance)));
                }
            }
            return result;
        }
        Zone zone = zoneRepository.findById(query.zoneId()).orElseThrow(NetworkErrors::zoneNotFound);
        return supportRepository.findByZoneId(zone.getId()).stream()
                .map(s -> new Candidate(s, round(distance(s, zone.getLatitude().doubleValue(), zone.getLongitude().doubleValue()))))
                .toList();
    }

    /**
     * Supports inside at least one campaign zone (circle or polygon), with the smallest distance to a target: the
     * circle centre, or 0 inside a polygon and its centroid otherwise (docs/round2-contract.md §4.3).
     */
    static List<Candidate> inCircles(List<DiffusionSupport> supports, List<CampaignZone> zones) {
        List<Candidate> result = new ArrayList<>();
        for (DiffusionSupport support : supports) {
            Double best = null;
            boolean inside = false;
            for (CampaignZone zone : zones) {
                double distance = TargetingGeometry.distanceKm(support, zone);
                if (TargetingGeometry.inside(support, zone)) {
                    inside = true;
                }
                best = best == null ? distance : Math.min(best, distance);
            }
            if (inside) {
                result.add(new Candidate(support, round(best)));
            }
        }
        return result;
    }

    AvailabilityResponse.Item item(Candidate candidate, TimeWindow window, Snapshot snapshot, Long campaignId,
                                   DynamicPricingService.Context pricing) {
        DiffusionSupport support = candidate.support();
        List<Reservation> reservations = snapshot.reservationsOf(support.getId());
        AvailabilityRules.Result result = AvailabilityRules.derive(support, window, reservations,
                snapshot.blocksOf(support.getId()), campaignId);
        Reservation own = campaignId == null ? null : reservations.stream()
                .filter(r -> AvailabilityRules.LIVE.contains(r.getReservationStatus()))
                .filter(r -> r.getCampaign() != null && Objects.equals(r.getCampaign().getId(), campaignId))
                .filter(window::overlaps)
                .min(Comparator.comparing(Reservation::getId))
                .orElse(null);
        EstimationService.Estimate estimate = estimationService.estimate(support, window, pricing);
        List<SupportAvailabilitySlot> conflicts = new ArrayList<>();
        result.overlapping().forEach(r -> conflicts.add(SupportService.toSlot(r)));
        result.blocks().forEach(b -> conflicts.add(SupportService.toSlot(b)));
        SupportResponse response = SupportService.toResponse(support);
        response.setDistanceKm(candidate.distanceKm());
        return AvailabilityResponse.Item.builder()
                .support(response)
                .distanceKm(candidate.distanceKm())
                .status(result.status().name())
                .remainingCapacity(result.remainingCapacity())
                .reservedByCampaign(own != null)
                .campaignReservationId(own != null ? own.getId() : null)
                .conflicts(conflicts)
                .estimatedViews(estimate.views())
                .estimatedCost(estimate.cost())
                .priceMultiplier(estimate.multiplier())
                .build();
    }

    static AvailabilityResponse.Summary summary(List<AvailabilityResponse.Item> items) {
        long available = 0;
        long reserved = 0;
        long occupied = 0;
        long maintenance = 0;
        long offline = 0;
        long views = 0;
        BigDecimal cost = BigDecimal.ZERO;
        for (AvailabilityResponse.Item item : items) {
            switch (AvailabilityStatus.valueOf(item.getStatus())) {
                case DISPONIBLE -> {
                    available++;
                    views += item.getEstimatedViews();
                    cost = cost.add(item.getEstimatedCost());
                }
                case RESERVE -> reserved++;
                case OCCUPE -> occupied++;
                case MAINTENANCE -> maintenance++;
                case HORS_LIGNE -> offline++;
            }
        }
        return AvailabilityResponse.Summary.builder()
                .totalSupports(items.size())
                .availableSupports(available)
                .reservedSupports(reserved)
                .occupiedSupports(occupied)
                .maintenanceSupports(maintenance)
                .offlineSupports(offline)
                .estimatedViewsAvailable(views)
                .estimatedCostAvailable(cost)
                .build();
    }

    List<AvailabilityResponse.AlternativeSlot> alternatives(List<Candidate> candidates, TimeWindow window,
                                                             Snapshot snapshot, Long campaignId) {
        List<AvailabilityResponse.AlternativeSlot> options = new ArrayList<>();
        for (AvailabilityRules.Preset preset : AvailabilityRules.Preset.values()) {
            if (preset.start.equals(window.startTime()) && preset.end.equals(window.endTime())) {
                continue;
            }
            options.add(alternative(candidates, window.withTimes(preset.start, preset.end), snapshot, campaignId));
        }
        for (int shift : ALTERNATIVE_SHIFTS_DAYS) {
            TimeWindow shifted = window.shiftDays(shift);
            options.add(alternative(candidates, shifted, load(shifted.startDate(), shifted.endDate()), campaignId));
        }
        return rankAlternatives(options);
    }

    static List<AvailabilityResponse.AlternativeSlot> rankAlternatives(List<AvailabilityResponse.AlternativeSlot> options) {
        return options.stream()
                .filter(o -> o.getAvailableSupports() > 0)
                .sorted(Comparator.comparingLong(AvailabilityResponse.AlternativeSlot::getAvailableSupports).reversed()
                        .thenComparing(AvailabilityResponse.AlternativeSlot::getStartDate)
                        .thenComparing(AvailabilityResponse.AlternativeSlot::getStartTime))
                .limit(MAX_ALTERNATIVES)
                .toList();
    }

    private AvailabilityResponse.AlternativeSlot alternative(List<Candidate> candidates, TimeWindow window,
                                                             Snapshot snapshot, Long campaignId) {
        long available = 0;
        long views = 0;
        for (Candidate candidate : candidates) {
            DiffusionSupport support = candidate.support();
            AvailabilityRules.Result result = AvailabilityRules.derive(support, window,
                    snapshot.reservationsOf(support.getId()), snapshot.blocksOf(support.getId()), campaignId);
            if (result.status() == AvailabilityStatus.DISPONIBLE) {
                available++;
                views += estimationService.baseEstimate(support, window).views();
            }
        }
        AvailabilityRules.Preset preset = AvailabilityRules.Preset.of(window.startTime(), window.endTime());
        return AvailabilityResponse.AlternativeSlot.builder()
                .startDate(window.startDate())
                .endDate(window.endDate())
                .startTime(window.startTime())
                .endTime(window.endTime())
                .preset(preset != null ? preset.name() : null)
                .availableSupports(available)
                .estimatedViewsAvailable(views)
                .build();
    }

    static double distance(DiffusionSupport support, double lat, double lng) {
        return GeoUtils.distanceKm(support.getLatitude().doubleValue(), support.getLongitude().doubleValue(), lat, lng);
    }

    static double round(double value) {
        return BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP).doubleValue();
    }
}
