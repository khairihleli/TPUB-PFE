package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.GeoPricingProperties;
import com.example.zelqanepfe.dto.DemandHeatmapResponse;
import com.example.zelqanepfe.dto.HeatmapPoints;
import com.example.zelqanepfe.dto.HeatmapResponse;
import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.DiffusionContentType;
import com.example.zelqanepfe.model.DiffusionInteraction;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.InteractionType;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.model.ZoneGeometryType;
import com.example.zelqanepfe.repository.CampaignZoneRepository;
import com.example.zelqanepfe.repository.DiffusionInteractionRepository;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.service.pricing.PricingCalculator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Aggregated heatmap points (docs/round2-contract.md §4.5): diffusions per support, reserved slot-hours and campaign
 * targets for staff, occupancy per support on a window for the wizard (no campaign or client data).
 */
@Service
@RequiredArgsConstructor
public class HeatmapService {

    static final long DEFAULT_DIFFUSION_DAYS = 30;
    static final long DEFAULT_DEMAND_DAYS = 30;
    /** Service day 07:00–23:00 used for capacity hours. */
    static final int SERVICE_HOURS_PER_DAY = 16;

    private final DiffusionLogRepository diffusionLogRepository;
    private final DiffusionInteractionRepository interactionRepository;
    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final SupportAvailabilityRepository blockRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ZoneRepository zoneRepository;
    private final GeoPricingProperties.Geo geoProperties;
    private final Clock clock;

    // --- diffusions ----------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public HeatmapResponse diffusions(LocalDate from, LocalDate to, List<DiffusionContentType> contentTypes, Long zoneId) {
        LocalDate end = to != null ? to : LocalDate.now(clock);
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DIFFUSION_DAYS - 1);
        validateRange(start, end);
        Set<DiffusionContentType> types = contentTypes == null || contentTypes.isEmpty()
                ? Set.of(DiffusionContentType.PUBLICITE) : Set.copyOf(contentTypes);
        Instant fromInstant = start.atStartOfDay(clock.getZone()).toInstant();
        Instant toInstant = end.plusDays(1).atStartOfDay(clock.getZone()).toInstant();

        Map<Long, Long> counts = new HashMap<>();
        for (Object[] row : diffusionLogRepository.countPerSupportBetween(types, fromInstant, toInstant)) {
            counts.put((Long) row[0], ((Number) row[1]).longValue());
        }
        Map<Long, Long> clicks = new HashMap<>();
        for (DiffusionInteraction interaction : interactionRepository.findByLogDiffusedBetween(fromInstant, toInstant)) {
            if (interaction.getInteractionType() == InteractionType.CLIC
                    && types.contains(interaction.getDiffusionLog().getContentType())) {
                clicks.merge(interaction.getSupport().getId(), 1L, Long::sum);
            }
        }

        List<HeatmapPoints.Feature> features = new ArrayList<>();
        for (DiffusionSupport support : sortedSupports(zoneId)) {
            long weight = counts.getOrDefault(support.getId(), 0L);
            if (weight < 1) {
                continue;
            }
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("supportId", support.getId());
            properties.put("supportName", support.getName());
            properties.put("zoneId", support.getZone().getId());
            properties.put("zoneName", support.getZone().getName());
            properties.put("weight", weight);
            properties.put("clicks", clicks.getOrDefault(support.getId(), 0L));
            features.add(HeatmapPoints.point(support.getLatitude().doubleValue(), support.getLongitude().doubleValue(),
                    properties));
        }
        return HeatmapResponse.builder()
                .from(start)
                .to(end)
                .maxWeight(features.stream().mapToDouble(HeatmapService::weight).max().orElse(0))
                .totalWeight(features.stream().mapToDouble(HeatmapService::weight).sum())
                .points(HeatmapPoints.builder().features(features).build())
                .build();
    }

    // --- demand (staff) ------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public DemandHeatmapResponse demand(LocalDate from, LocalDate to, Long zoneId) {
        LocalDate start = from != null ? from : LocalDate.now(clock);
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_DEMAND_DAYS - 1);
        validateRange(start, end);
        long rangeDays = ChronoUnit.DAYS.between(start, end) + 1;

        Map<Long, Double> reservedBySupport = new HashMap<>();
        for (Reservation reservation : reservationRepository.findByStatusesOverlappingDates(AvailabilityRules.LIVE, start, end)) {
            reservedBySupport.merge(reservation.getSupport().getId(), slotHours(reservation, start, end), Double::sum);
        }
        List<DiffusionSupport> supports = sortedSupports(zoneId);
        List<HeatmapPoints.Feature> reservations = new ArrayList<>();
        for (DiffusionSupport support : supports) {
            double reserved = reservedBySupport.getOrDefault(support.getId(), 0.0);
            if (reserved <= 0) {
                continue;
            }
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("supportId", support.getId());
            properties.put("supportName", support.getName());
            properties.put("zoneId", support.getZone().getId());
            properties.put("zoneName", support.getZone().getName());
            properties.put("weight", round(reserved, 2));
            properties.put("occupancy", round(occupancy(reserved, capacityHours(support, rangeDays)), 4));
            reservations.add(HeatmapPoints.point(support.getLatitude().doubleValue(), support.getLongitude().doubleValue(),
                    properties));
        }

        List<HeatmapPoints.Feature> targets = new ArrayList<>();
        Map<Long, Long> targetsByZone = new HashMap<>();
        for (CampaignZone target : campaignZoneRepository.findTargetsOverlapping(CampaignStatus.BROUILLON, start, end)) {
            Long targetZoneId = target.getZone() != null ? target.getZone().getId() : null;
            if (zoneId != null && !Objects.equals(zoneId, targetZoneId)) {
                continue;
            }
            targetsByZone.merge(targetZoneId, 1L, Long::sum);
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("campaignZoneId", target.getId());
            properties.put("campaignId", target.getCampaign().getId());
            ZoneGeometryType type = target.getGeometryType() == null ? ZoneGeometryType.CERCLE : target.getGeometryType();
            properties.put("type", type.name());
            properties.put("weight", 1);
            targets.add(HeatmapPoints.point(target.getLatitude().doubleValue(), target.getLongitude().doubleValue(),
                    properties));
        }

        Map<Long, List<DiffusionSupport>> activeByZone = supports.stream()
                .filter(s -> s.getTechnicalStatus() == TechnicalStatus.ACTIF)
                .collect(Collectors.groupingBy(s -> s.getZone().getId()));
        List<DemandHeatmapResponse.ZoneDemand> byZone = new ArrayList<>();
        for (Zone zone : activeZones(zoneId)) {
            double reserved = 0;
            double capacity = 0;
            for (DiffusionSupport support : activeByZone.getOrDefault(zone.getId(), List.of())) {
                reserved += reservedBySupport.getOrDefault(support.getId(), 0.0);
                capacity += capacityHours(support, rangeDays);
            }
            byZone.add(DemandHeatmapResponse.ZoneDemand.builder()
                    .zoneId(zone.getId())
                    .zoneName(zone.getName())
                    .reservedHours(round(reserved, 2))
                    .capacityHours(round(capacity, 2))
                    .occupancy(round(occupancy(reserved, capacity), 4))
                    .targets(targetsByZone.getOrDefault(zone.getId(), 0L))
                    .build());
        }
        return DemandHeatmapResponse.builder()
                .from(start)
                .to(end)
                .reservations(HeatmapPoints.builder().features(reservations).build())
                .targets(HeatmapPoints.builder().features(targets).build())
                .maxReservationWeight(reservations.stream().mapToDouble(HeatmapService::weight).max().orElse(0))
                .byZone(byZone)
                .build();
    }

    // --- demand (wizard) -----------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public HeatmapResponse demandPublic(LocalDate startDate, LocalDate endDate, LocalTime startTime, LocalTime endTime) {
        LocalDate start = startDate != null ? startDate : LocalDate.now(clock);
        LocalDate end = endDate != null ? endDate : start.plusDays(DEFAULT_DEMAND_DAYS - 1);
        LocalTime st = startTime != null ? startTime : AvailabilityRules.Preset.JOURNEE.start;
        LocalTime et = endTime != null ? endTime : AvailabilityRules.Preset.JOURNEE.end;
        validateRange(start, end);
        if (!st.isBefore(et)) {
            throw NetworkErrors.invalidTimeRange();
        }
        TimeWindow window = new TimeWindow(start, end, st, et);

        Map<Long, List<Reservation>> reservations = reservationRepository
                .findByStatusesOverlappingDates(AvailabilityRules.LIVE, start, end).stream()
                .collect(Collectors.groupingBy(r -> r.getSupport().getId()));
        Map<Long, List<SupportAvailability>> blocks = blockRepository.findByAvailabilityDateBetween(start, end).stream()
                .collect(Collectors.groupingBy(b -> b.getSupport().getId()));

        List<HeatmapPoints.Feature> features = new ArrayList<>();
        Map<Long, PricingCalculator.Occupancy> occupancyByZone = new HashMap<>();
        Map<Long, long[]> countsByZone = new HashMap<>();
        for (DiffusionSupport support : sortedSupports(null)) {
            if (support.getTechnicalStatus() != TechnicalStatus.ACTIF) {
                continue;
            }
            List<Reservation> own = reservations.getOrDefault(support.getId(), List.of());
            PricingCalculator.Occupancy occupancy = PricingCalculator.occupancy(support, own, window, null);
            Long supportZoneId = support.getZone().getId();
            occupancyByZone.merge(supportZoneId, occupancy, PricingCalculator.Occupancy::plus);
            long[] counts = countsByZone.computeIfAbsent(supportZoneId, id -> new long[2]);
            counts[1]++;
            AvailabilityRules.Result status = AvailabilityRules.derive(support, window, own,
                    blocks.getOrDefault(support.getId(), List.of()), null);
            if (status.status() == AvailabilityStatus.DISPONIBLE) {
                counts[0]++;
            }
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("supportId", support.getId());
            properties.put("zoneId", supportZoneId);
            properties.put("zoneName", support.getZone().getName());
            properties.put("weight", round(occupancy.ratio(), 4));
            features.add(HeatmapPoints.point(support.getLatitude().doubleValue(), support.getLongitude().doubleValue(),
                    properties));
        }
        List<HeatmapResponse.PublicZone> byZone = new ArrayList<>();
        for (Zone zone : activeZones(null)) {
            long[] counts = countsByZone.getOrDefault(zone.getId(), new long[2]);
            PricingCalculator.Occupancy occupancy = occupancyByZone.get(zone.getId());
            byZone.add(HeatmapResponse.PublicZone.builder()
                    .zoneId(zone.getId())
                    .zoneName(zone.getName())
                    .occupancy(occupancy == null ? 0 : round(occupancy.ratio(), 4))
                    .availableSupports(counts[0])
                    .totalSupports(counts[1])
                    .build());
        }
        return HeatmapResponse.builder()
                .from(start)
                .to(end)
                .maxWeight(features.stream().mapToDouble(HeatmapService::weight).max().orElse(0))
                .totalWeight(round(features.stream().mapToDouble(HeatmapService::weight).sum(), 4))
                .points(HeatmapPoints.builder().features(features).build())
                .byZone(byZone)
                .build();
    }

    // --- rules (unit-tested) -------------------------------------------------------------------------------------

    void validateRange(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        long max = geoProperties.getHeatmap().getMaxRangeDays();
        if (ChronoUnit.DAYS.between(from, to) + 1 > max) {
            throw NetworkErrors.invalidRange("La période ne peut pas dépasser " + max + " jours.");
        }
    }

    /** {@code overlapDays × hours(startTime, endTime)} of a reservation inside [from, to]. */
    static double slotHours(Reservation reservation, LocalDate from, LocalDate to) {
        LocalDate start = reservation.getStartDate().isAfter(from) ? reservation.getStartDate() : from;
        LocalDate end = reservation.getEndDate().isBefore(to) ? reservation.getEndDate() : to;
        if (end.isBefore(start) || !reservation.getStartTime().isBefore(reservation.getEndTime())) {
            return 0;
        }
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        double hours = (reservation.getEndTime().toSecondOfDay() - reservation.getStartTime().toSecondOfDay()) / 3600.0;
        return days * hours;
    }

    /** {@code rangeDays × 16 × capacity}. */
    static double capacityHours(DiffusionSupport support, long rangeDays) {
        int capacity = Math.max(1, support.getDiffusionCapacity() == null ? 1 : support.getDiffusionCapacity());
        return rangeDays * SERVICE_HOURS_PER_DAY * (double) capacity;
    }

    static double occupancy(double reserved, double capacity) {
        return capacity <= 0 ? 0 : Math.min(1, reserved / capacity);
    }

    static double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }

    private static double weight(HeatmapPoints.Feature feature) {
        return ((Number) feature.getProperties().get("weight")).doubleValue();
    }

    private List<DiffusionSupport> sortedSupports(Long zoneId) {
        List<DiffusionSupport> supports = zoneId == null ? supportRepository.findAll() : supportRepository.findByZoneId(zoneId);
        return supports.stream()
                .filter(s -> s.getLatitude() != null && s.getLongitude() != null && s.getZone() != null)
                .sorted(Comparator.comparing(DiffusionSupport::getId))
                .toList();
    }

    private List<Zone> activeZones(Long zoneId) {
        return zoneRepository.findByIsActiveTrue().stream()
                .filter(zone -> zoneId == null || Objects.equals(zone.getId(), zoneId))
                .sorted(Comparator.comparing(Zone::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }
}
