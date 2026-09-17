package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.ReservationBatchRequest;
import com.example.tpubpfe.dto.ReservationConflictResponse;
import com.example.tpubpfe.dto.ReservationRequest;
import com.example.tpubpfe.dto.ReservationResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.util.GeoUtils;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Support reservations: creation with time-of-day conflicts and zone/technical enforcement, batch, cancel,
 * search and conflict detection (contract §2.4).
 */
@Service
@RequiredArgsConstructor
public class ReservationService {

    static final int MAX_PAGE_SIZE = 100;
    static final int DEFAULT_CONFLICT_DAYS = 90;
    private static final Map<String, String> SORT_FIELDS = Map.of(
            "createdAt", "createdAt", "startDate", "startDate", "endDate", "endDate", "id", "id");
    private static final Set<CampaignStatus> ADVERTISER_CANCELLABLE_CAMPAIGN =
            Set.of(CampaignStatus.BROUILLON, CampaignStatus.REJECTED_BY_AI);

    private final ReservationRepository reservationRepository;
    private final DiffusionSupportRepository supportRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ClientRepository clientRepository;
    private final CampaignAccessGuard accessGuard;
    private final CampaignReservationSync reservationSync;
    private final AvailabilityService availabilityService;
    private final EstimationService estimationService;
    private final AuditService auditService;
    private final Clock clock;

    // --- creation ------------------------------------------------------------------------------------------------

    @Transactional
    public ReservationResponse create(ReservationRequest request) {
        Campaign campaign = accessGuard.owned(request.getCampaignId());
        TimeWindow window = checkCampaign(campaign, request.getStartDate(), request.getEndDate(),
                request.getStartTime(), request.getEndTime());
        List<CampaignZone> circles = campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId());
        if (request.getSupportId() == null) {
            throw NetworkErrors.supportNotFound();
        }
        DiffusionSupport support = supportRepository.findAllByIdForUpdate(List.of(request.getSupportId())).stream()
                .findFirst().orElseThrow(NetworkErrors::supportNotFound);
        String code = supportRefusal(campaign, support, window, circles);
        if (code != null) {
            throw NetworkErrors.byCode(code);
        }
        Reservation saved = reservationRepository.save(build(campaign, support, window));
        reservationSync.recomputeEstimatedViews(campaign);
        return toResponse(saved, CampaignAccessGuard.currentUser());
    }

    /** All-or-nothing: 409 BATCH_CONFLICT with {@code errors = {supportId: CODE}} and nothing persisted. */
    @Transactional
    public List<ReservationResponse> createBatch(ReservationBatchRequest request) {
        Campaign campaign = accessGuard.owned(request.getCampaignId());
        TimeWindow window = checkCampaign(campaign, request.getStartDate(), request.getEndDate(),
                request.getStartTime(), request.getEndTime());
        List<CampaignZone> circles = campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId());
        List<Long> ids = new ArrayList<>(new LinkedHashSet<>(request.getSupportIds()));
        Map<Long, DiffusionSupport> supports = supportRepository.findAllByIdForUpdate(ids).stream()
                .collect(Collectors.toMap(DiffusionSupport::getId, s -> s));
        Map<String, String> errors = new LinkedHashMap<>();
        List<Reservation> toSave = new ArrayList<>();
        for (Long id : ids) {
            DiffusionSupport support = supports.get(id);
            String code = support == null ? "SUPPORT_NOT_FOUND" : supportRefusal(campaign, support, window, circles);
            if (code != null) {
                errors.put(String.valueOf(id), code);
            } else {
                toSave.add(build(campaign, support, window));
            }
        }
        if (!errors.isEmpty()) {
            throw NetworkErrors.batchConflict(errors);
        }
        List<Reservation> saved = reservationRepository.saveAll(toSave);
        reservationSync.recomputeEstimatedViews(campaign);
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        return saved.stream().map(r -> toResponse(r, user)).toList();
    }

    /** Checks 1 to 5 of the contract (campaign-level); returns the resolved window. */
    TimeWindow checkCampaign(Campaign campaign, LocalDate startDate, LocalDate endDate, LocalTime startTime,
                             LocalTime endTime) {
        if (campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw NetworkErrors.campaignNotReservable();
        }
        CampaignService.ensureClientAllowed(campaign.getClient());
        LocalDate sd = startDate != null ? startDate : campaign.getStartDate();
        LocalDate ed = endDate != null ? endDate : campaign.getEndDate();
        LocalTime st = startTime != null ? startTime : campaign.getStartTime();
        LocalTime et = endTime != null ? endTime : campaign.getEndTime();
        Map<String, String> missing = new LinkedHashMap<>();
        if (sd == null) {
            missing.put("startDate", "Renseignez la date de début (sur la réservation ou la campagne).");
        }
        if (ed == null) {
            missing.put("endDate", "Renseignez la date de fin (sur la réservation ou la campagne).");
        }
        if (st == null) {
            missing.put("startTime", "Renseignez l'heure de début (sur la réservation ou la campagne).");
        }
        if (et == null) {
            missing.put("endTime", "Renseignez l'heure de fin (sur la réservation ou la campagne).");
        }
        if (!missing.isEmpty()) {
            throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "Créneau de réservation incomplet.", missing);
        }
        if (ed.isBefore(sd)) {
            throw CampaignErrors.invalidPeriod();
        }
        if (!st.isBefore(et)) {
            throw CampaignErrors.invalidTimeRange();
        }
        if (sd.isBefore(LocalDate.now(clock))) {
            throw CampaignErrors.startDateInPast();
        }
        TimeWindow window = new TimeWindow(sd, ed, st, et);
        if (!insideCampaign(window, campaign)) {
            throw NetworkErrors.reservationOutsideCampaignPeriod();
        }
        if (campaignZoneRepository.countByCampaignId(campaign.getId()) == 0) {
            throw NetworkErrors.campaignZoneRequired();
        }
        return window;
    }

    /** Checks 6 to 8 of the contract (per support); null when the support can be reserved. */
    String supportRefusal(Campaign campaign, DiffusionSupport support, TimeWindow window, List<CampaignZone> circles) {
        if (!insideAnyCircle(support, circles)) {
            return "SUPPORT_OUTSIDE_CAMPAIGN_ZONE";
        }
        List<Reservation> existing = reservationRepository.findBookedPeriodsForSupport(support.getId(),
                window.startDate(), window.endDate(), List.copyOf(AvailabilityRules.LIVE));
        boolean duplicate = existing.stream()
                .anyMatch(r -> Objects.equals(r.getCampaign().getId(), campaign.getId()) && window.overlaps(r));
        if (duplicate) {
            return "RESERVATION_DUPLICATE";
        }
        AvailabilityRules.Result result = availabilityService.deriveOne(support, window, campaign.getId());
        return switch (result.status()) {
            case MAINTENANCE, HORS_LIGNE -> "SUPPORT_UNAVAILABLE";
            case RESERVE, OCCUPE -> "SUPPORT_ALREADY_RESERVED";
            case DISPONIBLE -> null;
        };
    }

    static boolean insideCampaign(TimeWindow window, Campaign campaign) {
        return (campaign.getStartDate() == null || !window.startDate().isBefore(campaign.getStartDate()))
                && (campaign.getEndDate() == null || !window.endDate().isAfter(campaign.getEndDate()))
                && (campaign.getStartTime() == null || !window.startTime().isBefore(campaign.getStartTime()))
                && (campaign.getEndTime() == null || !window.endTime().isAfter(campaign.getEndTime()));
    }

    static boolean insideAnyCircle(DiffusionSupport support, List<CampaignZone> circles) {
        double lat = support.getLatitude().doubleValue();
        double lng = support.getLongitude().doubleValue();
        return circles.stream().anyMatch(c -> GeoUtils.within(lat, lng, c.getLatitude().doubleValue(),
                c.getLongitude().doubleValue(), c.getRadiusKm().doubleValue()));
    }

    private Reservation build(Campaign campaign, DiffusionSupport support, TimeWindow window) {
        EstimationService.Estimate estimate = estimationService.estimate(support, window);
        return Reservation.builder()
                .campaign(campaign)
                .zone(support.getZone())
                .support(support)
                .startDate(window.startDate())
                .endDate(window.endDate())
                .startTime(window.startTime())
                .endTime(window.endTime())
                .availabilityStatus(AvailabilityStatus.RESERVE)
                .reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(estimate.views())
                .estimatedCost(estimate.cost())
                .build();
    }

    // --- cancel --------------------------------------------------------------------------------------------------

    @Transactional
    public ReservationResponse cancel(Long reservationId, String rawReason) {
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(NetworkErrors::reservationNotFound);
        boolean admin = user != null && RoleCode.ADMINISTRATEUR.name().equals(user.getRoleCode());
        if (!admin) {
            // Owner only; anyone else gets a 404 so ids cannot be probed.
            try {
                accessGuard.owned(reservation.getCampaign().getId());
            } catch (ApiException ex) {
                throw NetworkErrors.reservationNotFound();
            }
        }
        if (!isCancellable(reservation, user)) {
            throw NetworkErrors.reservationNotCancellable();
        }
        String reason = rawReason == null || rawReason.isBlank() ? null : rawReason.trim();
        reservation.setReservationStatus(ReservationStatus.ANNULEE);
        reservation.setCancelledAt(Instant.now(clock));
        reservation.setCancelledByUserId(user != null ? user.getId() : null);
        reservation.setCancelReason(reason);
        Reservation saved = reservationRepository.save(reservation);
        reservationSync.recomputeEstimatedViews(reservation.getCampaign());
        if (admin) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("campaignId", reservation.getCampaign().getId());
            details.put("supportId", reservation.getSupport().getId());
            details.put("reason", reason);
            auditService.record("RESERVATION_CANCELLED", "RESERVATION", reservation.getId(),
                    "Annulation de la réservation #" + reservation.getId() + " (Porteur « "
                            + reservation.getSupport().getName() + " », campagne « " + reservation.getCampaign().getName()
                            + " »)", details);
        }
        return toResponse(saved, user);
    }

    /**
     * Annonceur owner: TEMPORAIRE on a BROUILLON | REJECTED_BY_AI campaign. Administrator: TEMPORAIRE | CONFIRMEE.
     */
    static boolean isCancellable(Reservation reservation, UserDetailsImpl user) {
        if (user == null) {
            return false;
        }
        ReservationStatus status = reservation.getReservationStatus();
        if (RoleCode.ADMINISTRATEUR.name().equals(user.getRoleCode())) {
            return status == ReservationStatus.TEMPORAIRE || status == ReservationStatus.CONFIRMEE;
        }
        if (RoleCode.ANNONCEUR.name().equals(user.getRoleCode())) {
            Campaign campaign = reservation.getCampaign();
            boolean owner = campaign.getClient() != null && campaign.getClient().getUser() != null
                    && Objects.equals(campaign.getClient().getUser().getId(), user.getId());
            return owner && status == ReservationStatus.TEMPORAIRE
                    && ADVERTISER_CANCELLABLE_CAMPAIGN.contains(campaign.getStatus());
        }
        return false;
    }

    // --- queries -------------------------------------------------------------------------------------------------

    public record Filter(List<ReservationStatus> statuses, Long campaignId, Long supportId, Long zoneId, Long clientId,
                         LocalDate from, LocalDate to) {
    }

    @Transactional(readOnly = true)
    public PageResponse<ReservationResponse> search(Filter filter, int page, int size, String sort) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)), parseSort(sort));
        Page<Reservation> result = reservationRepository.findAll(specification(filter), pageable);
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        return PageResponse.<ReservationResponse>builder()
                .items(result.getContent().stream().map(r -> toResponse(r, user)).toList())
                .page(result.getNumber())
                .size(result.getSize())
                .totalItems(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getMine(List<ReservationStatus> statuses, Long campaignId) {
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        if (user == null) {
            throw CampaignErrors.clientProfileMissing();
        }
        Client client = clientRepository.findByUserId(user.getId()).orElseThrow(CampaignErrors::clientProfileMissing);
        return reservationRepository.findByClientId(client.getId()).stream()
                .filter(r -> statuses == null || statuses.isEmpty() || statuses.contains(r.getReservationStatus()))
                .filter(r -> campaignId == null || Objects.equals(r.getCampaign().getId(), campaignId))
                .map(r -> toResponse(r, user))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getByCampaign(Long campaignId) {
        Campaign campaign = accessGuard.readable(campaignId);
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        return reservationRepository.findByCampaignId(campaign.getId()).stream()
                .sorted(Comparator.comparing(Reservation::getId))
                .map(r -> toResponse(r, user))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getAll() {
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        return reservationRepository.findAll().stream().map(r -> toResponse(r, user)).toList();
    }

    /** Over- and fully-booked sets of overlapping reservations (contract §2.4). */
    @Transactional(readOnly = true)
    public List<ReservationConflictResponse> conflicts(LocalDate from, LocalDate to, Long zoneId, Long supportId) {
        LocalDate start = from != null ? from : LocalDate.now(clock);
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_CONFLICT_DAYS);
        if (end.isBefore(start)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        Map<Long, List<Reservation>> bySupport = reservationRepository
                .findByStatusesOverlappingDates(AvailabilityRules.LIVE, start, end).stream()
                .filter(r -> supportId == null || Objects.equals(r.getSupport().getId(), supportId))
                .filter(r -> zoneId == null || Objects.equals(r.getSupport().getZone().getId(), zoneId))
                .collect(Collectors.groupingBy(r -> r.getSupport().getId(), LinkedHashMap::new, Collectors.toList()));
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        List<ReservationConflictResponse> result = new ArrayList<>();
        for (List<Reservation> group : bySupport.values()) {
            DiffusionSupport support = group.get(0).getSupport();
            int capacity = Math.max(1, support.getDiffusionCapacity() == null ? 1 : support.getDiffusionCapacity());
            for (ConflictSet set : detectConflicts(group, capacity)) {
                result.add(ReservationConflictResponse.builder()
                        .supportId(support.getId())
                        .supportName(support.getName())
                        .zoneId(support.getZone().getId())
                        .zoneName(support.getZone().getName())
                        .capacity(capacity)
                        .severity(set.severity())
                        .overlapStartDate(set.overlap().startDate())
                        .overlapEndDate(set.overlap().endDate())
                        .overlapStartTime(set.overlap().startTime())
                        .overlapEndTime(set.overlap().endTime())
                        .reservations(set.reservations().stream().map(r -> toResponse(r, user)).toList())
                        .build());
            }
        }
        result.sort(Comparator.comparing((ReservationConflictResponse c) -> "CONFLIT".equals(c.getSeverity()) ? 0 : 1)
                .thenComparing(ReservationConflictResponse::getSupportName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(ReservationConflictResponse::getOverlapStartDate)
                .thenComparing(ReservationConflictResponse::getOverlapStartTime));
        return result;
    }

    public record ConflictSet(String severity, TimeWindow overlap, List<Reservation> reservations) {
    }

    /**
     * For each reservation r of one support: S = reservations overlapping r (r included). |S| > capacity → CONFLIT,
     * |S| == capacity ≥ 2 → SATURE. Identical sets are reported once; the overlap is the intersection of S, or r's
     * own window when that intersection is empty.
     */
    static List<ConflictSet> detectConflicts(List<Reservation> reservations, int capacity) {
        List<Reservation> live = reservations.stream()
                .filter(r -> AvailabilityRules.LIVE.contains(r.getReservationStatus()))
                .sorted(Comparator.comparing(Reservation::getId))
                .toList();
        Set<Set<Long>> seen = new HashSet<>();
        List<ConflictSet> sets = new ArrayList<>();
        for (Reservation r : live) {
            TimeWindow own = TimeWindow.of(r);
            List<Reservation> overlapping = live.stream().filter(o -> o == r || own.overlaps(o)).toList();
            int n = overlapping.size();
            String severity = n > capacity ? "CONFLIT" : (n == capacity && capacity >= 2 ? "SATURE" : null);
            if (severity == null) {
                continue;
            }
            Set<Long> key = overlapping.stream().map(Reservation::getId).collect(Collectors.toCollection(TreeSet::new));
            if (!seen.add(key)) {
                continue;
            }
            sets.add(new ConflictSet(severity, intersection(overlapping, own), overlapping));
        }
        return sets;
    }

    static TimeWindow intersection(List<Reservation> reservations, TimeWindow fallback) {
        LocalDate sd = reservations.stream().map(Reservation::getStartDate).max(Comparator.naturalOrder()).orElseThrow();
        LocalDate ed = reservations.stream().map(Reservation::getEndDate).min(Comparator.naturalOrder()).orElseThrow();
        LocalTime st = reservations.stream().map(Reservation::getStartTime).max(Comparator.naturalOrder()).orElseThrow();
        LocalTime et = reservations.stream().map(Reservation::getEndTime).min(Comparator.naturalOrder()).orElseThrow();
        if (ed.isBefore(sd) || !st.isBefore(et)) {
            return fallback;
        }
        return new TimeWindow(sd, ed, st, et);
    }

    static Specification<Reservation> specification(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.statuses() != null && !filter.statuses().isEmpty()) {
                predicates.add(root.get("reservationStatus").in(filter.statuses()));
            }
            if (filter.campaignId() != null) {
                predicates.add(cb.equal(root.get("campaign").get("id"), filter.campaignId()));
            }
            if (filter.supportId() != null) {
                predicates.add(cb.equal(root.get("support").get("id"), filter.supportId()));
            }
            if (filter.zoneId() != null) {
                predicates.add(cb.equal(root.get("zone").get("id"), filter.zoneId()));
            }
            if (filter.clientId() != null) {
                predicates.add(cb.equal(root.get("campaign").get("client").get("id"), filter.clientId()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("endDate"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), filter.to()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        }
        String[] parts = sort.split(",");
        String field = SORT_FIELDS.get(parts[0].trim());
        if (field == null) {
            throw CampaignErrors.invalidParameter("sort", "Tri invalide : utilisez createdAt, startDate, endDate ou id.");
        }
        Sort.Direction direction = Sort.Direction.DESC;
        if (parts.length > 1) {
            String dir = parts[1].trim().toLowerCase(Locale.ROOT);
            if ("asc".equals(dir)) {
                direction = Sort.Direction.ASC;
            } else if (!"desc".equals(dir)) {
                throw CampaignErrors.invalidParameter("sort", "Sens de tri invalide : utilisez asc ou desc.");
            }
        }
        return Sort.by(new Sort.Order(direction, field), Sort.Order.desc("id"));
    }

    static ReservationResponse toResponse(Reservation reservation, UserDetailsImpl user) {
        Campaign campaign = reservation.getCampaign();
        DiffusionSupport support = reservation.getSupport();
        return ReservationResponse.builder()
                .id(reservation.getId())
                .campaignId(campaign.getId())
                .campaignName(campaign.getName())
                .campaignStatus(campaign.getStatus() != null ? campaign.getStatus().name() : null)
                .clientCompanyName(campaign.getClient() != null ? campaign.getClient().getCompanyName() : null)
                .zoneId(reservation.getZone().getId())
                .zoneName(reservation.getZone().getName())
                .supportId(support.getId())
                .supportName(support.getName())
                .supportType(support.getSupportType() != null ? support.getSupportType().name() : null)
                .startDate(reservation.getStartDate())
                .endDate(reservation.getEndDate())
                .startTime(reservation.getStartTime())
                .endTime(reservation.getEndTime())
                .availabilityStatus(reservation.getAvailabilityStatus().name())
                .reservationStatus(reservation.getReservationStatus().name())
                .estimatedViews(reservation.getEstimatedViews())
                .estimatedCost(reservation.getEstimatedCost())
                .createdAt(reservation.getCreatedAt())
                .cancelledAt(reservation.getCancelledAt())
                .cancelReason(reservation.getCancelReason())
                .expiredAt(reservation.getExpiredAt())
                .cancellable(isCancellable(reservation, user))
                .build();
    }
}
