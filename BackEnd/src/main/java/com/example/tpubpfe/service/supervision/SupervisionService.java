package com.example.tpubpfe.service.supervision;

import com.example.tpubpfe.config.SupervisionProperties;
import com.example.tpubpfe.dto.DiffusionLiveEvent;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.SupervisionAlertResponse;
import com.example.tpubpfe.dto.SupervisionSnapshot;
import com.example.tpubpfe.model.AlertSeverity;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.NotificationType;
import com.example.tpubpfe.model.PresenceState;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SupervisionAlert;
import com.example.tpubpfe.model.SupervisionAlertType;
import com.example.tpubpfe.model.SupportPresence;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.SupervisionAlertRepository;
import com.example.tpubpfe.repository.SupportPresenceRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.service.AuditService;
import com.example.tpubpfe.service.CampaignErrors;
import com.example.tpubpfe.service.EmergencyService;
import com.example.tpubpfe.service.SecurityUtils;
import com.example.tpubpfe.service.approval.ApprovalErrors;
import com.example.tpubpfe.service.notification.NotificationService;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Supervision read model (docs/round2-contract.md §5.3): live snapshot, alert journal and zone saturation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SupervisionService {

    private static final int RECENT_DIFFUSIONS = 50;
    private static final int MAX_PAGE_SIZE = 100;

    private final DiffusionSupportRepository supportRepository;
    private final SupportPresenceRepository presenceRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final SupervisionAlertRepository alertRepository;
    private final ReservationRepository reservationRepository;
    private final ZoneRepository zoneRepository;
    private final EmergencyService emergencyService;
    private final AlertService alertService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final SupervisionProperties.Supervision properties;
    private final Clock clock;

    @Transactional(readOnly = true)
    public SupervisionSnapshot snapshot() {
        Instant now = Instant.now(clock);
        List<DiffusionSupport> supports = supportRepository.findAll();
        Map<Long, SupportPresence> presences = presenceRepository.findAll().stream()
                .collect(Collectors.toMap(SupportPresence::getSupportId, Function.identity(), (a, b) -> a));

        List<DiffusionLog> recent = diffusionLogRepository
                .findAll((Specification<DiffusionLog>) (root, query, cb) -> cb.conjunction(),
                        PageRequest.of(0, RECENT_DIFFUSIONS,
                                Sort.by(Sort.Order.desc("diffusedAt"), Sort.Order.desc("id"))))
                .getContent();
        Map<Long, DiffusionLog> lastBySupport = new HashMap<>();
        for (DiffusionLog log : recent) {
            if (log.getSupport() != null) {
                lastBySupport.putIfAbsent(log.getSupport().getId(), log);
            }
        }
        List<Long> missing = presences.values().stream()
                .map(SupportPresence::getCurrentDiffusionLogId)
                .filter(Objects::nonNull)
                .filter(id -> recent.stream().noneMatch(log -> id.equals(log.getId())))
                .distinct()
                .toList();
        Map<Long, DiffusionLog> byId = diffusionLogRepository.findAllById(missing).stream()
                .collect(Collectors.toMap(DiffusionLog::getId, Function.identity(), (a, b) -> a));

        List<SupervisionSnapshot.SupportRow> rows = new ArrayList<>();
        long online = 0;
        long offline = 0;
        long unknown = 0;
        for (DiffusionSupport support : supports) {
            SupportPresence presence = presences.get(support.getId());
            String state = presence == null ? "INCONNU" : presence.getState().name();
            if (presence == null) {
                unknown++;
            } else if (presence.getState() == PresenceState.EN_LIGNE) {
                online++;
            } else {
                offline++;
            }
            DiffusionLog current = null;
            if (presence != null && presence.getCurrentDiffusionLogId() != null) {
                current = byId.getOrDefault(presence.getCurrentDiffusionLogId(),
                        lastBySupport.get(support.getId()));
            }
            if (current == null) {
                current = lastBySupport.get(support.getId());
            }
            Zone zone = support.getZone();
            rows.add(SupervisionSnapshot.SupportRow.builder()
                    .supportId(support.getId())
                    .name(support.getName())
                    .zoneId(zone == null ? null : zone.getId())
                    .zoneName(zone == null ? null : zone.getName())
                    .latitude(support.getLatitude())
                    .longitude(support.getLongitude())
                    .technicalStatus(support.getTechnicalStatus() == null ? null : support.getTechnicalStatus().name())
                    .presence(state)
                    .lastHeartbeatAt(presence == null ? null : presence.getLastHeartbeatAt())
                    .playerVersion(presence == null ? null : presence.getPlayerVersion())
                    .current(current == null ? null : SupervisionSnapshot.CurrentDiffusion.builder()
                            .contentType(current.getContentType() == null ? null : current.getContentType().name())
                            .title(current.getTitle())
                            .campaignId(current.getCampaign() == null ? null : current.getCampaign().getId())
                            .emergencyId(current.getEmergency() == null ? null : current.getEmergency().getId())
                            .diffusedAt(current.getDiffusedAt())
                            .build())
                    .build());
        }

        List<SupervisionAlertResponse> alerts = alertRepository.findTop50ByResolvedAtIsNullOrderByCreatedAtDescIdDesc()
                .stream().map(alertService::toResponse).toList();
        List<DiffusionLiveEvent> feed = recent.stream().map(DiffusionFeedService::toEvent).toList();
        Instant oneHourAgo = now.minus(Duration.ofHours(1));
        long lastHour = diffusionLogRepository.count((Specification<DiffusionLog>) (root, query, cb) ->
                cb.greaterThanOrEqualTo(root.get("diffusedAt"), oneHourAgo));
        var emergencies = emergencyService.liveEvents();
        long active = emergencies.stream().filter(e -> "EN_COURS".equals(e.getState())).count();

        return SupervisionSnapshot.builder()
                .serverTime(now)
                .supports(rows)
                .emergencies(emergencies)
                .alerts(alerts)
                .recentDiffusions(feed)
                .stats(SupervisionSnapshot.Stats.builder()
                        .onlineSupports(online)
                        .offlineSupports(offline)
                        .unknownSupports(unknown)
                        .diffusionsLastHour(lastHour)
                        .activeEmergencies(active)
                        .openAlerts(alertRepository.countByResolvedAtIsNull())
                        .build())
                .build();
    }

    /** Counters only, pushed on the stream every minute. */
    @Transactional(readOnly = true)
    public SupervisionSnapshot.Stats stats() {
        return snapshot().getStats();
    }

    /** Alert journal. {@code status} is OUVERTE (default), RESOLUE or TOUTES. */
    @Transactional(readOnly = true)
    public PageResponse<SupervisionAlertResponse> alerts(String status, String type, int page, int size) {
        String state = status == null || status.isBlank() ? "OUVERTE" : status.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("OUVERTE", "RESOLUE", "TOUTES").contains(state)) {
            throw CampaignErrors.invalidParameter("status", "Valeur invalide pour status : " + status);
        }
        SupervisionAlertType alertType = null;
        if (type != null && !type.isBlank()) {
            try {
                alertType = SupervisionAlertType.valueOf(type.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw CampaignErrors.invalidParameter("type", "Valeur invalide pour type : " + type);
            }
        }
        SupervisionAlertType wanted = alertType;
        Specification<SupervisionAlert> specification = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if ("OUVERTE".equals(state)) {
                predicates.add(cb.isNull(root.get("resolvedAt")));
            } else if ("RESOLUE".equals(state)) {
                predicates.add(cb.isNotNull(root.get("resolvedAt")));
            }
            if (wanted != null) {
                predicates.add(cb.equal(root.get("alertType"), wanted));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)),
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<SupervisionAlert> result = alertRepository.findAll(specification, pageable);
        return PageResponse.of(result.map(alertService::toResponse));
    }

    @Transactional
    public SupervisionAlertResponse acknowledge(Long id) {
        SupervisionAlert alert = alertRepository.findById(id).orElseThrow(ApprovalErrors::alertNotFound);
        if (alert.getAcknowledgedAt() == null) {
            alert.setAcknowledgedAt(Instant.now(clock));
            alert.setAcknowledgedByUserId(SecurityUtils.getCurrentUser().getId());
            alert = alertRepository.save(alert);
            alertService.publish(alert);
            auditService.record("ALERT_ACKNOWLEDGED", "ALERT", alert.getId(),
                    "Prise en compte de l'alerte « " + alert.getTitle() + " »", null);
        }
        return alertService.toResponse(alert);
    }

    /**
     * Zone saturation sweep (docs/round2-contract.md §5.3): a zone whose ACTIF supports are booked to capacity now
     * raises an alert; it is resolved once the occupancy drops 10 points below the threshold.
     */
    @Transactional
    public int evaluateSaturation() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate date = now.toLocalDate();
        LocalTime time = now.toLocalTime();
        BigDecimal threshold = properties.getSaturationThreshold();
        Map<Long, List<DiffusionSupport>> byZone = new LinkedHashMap<>();
        for (DiffusionSupport support : supportRepository.findAll()) {
            if (support.getTechnicalStatus() != TechnicalStatus.ACTIF || support.getZone() == null) {
                continue;
            }
            byZone.computeIfAbsent(support.getZone().getId(), id -> new ArrayList<>()).add(support);
        }
        int changes = 0;
        for (Zone zone : zoneRepository.findByIsActiveTrue()) {
            List<DiffusionSupport> supports = byZone.getOrDefault(zone.getId(), List.of());
            if (supports.isEmpty()) {
                continue;
            }
            long saturated = supports.stream().filter(support -> isSaturated(support, date, time)).count();
            BigDecimal occupancy = occupancy(saturated, supports.size());
            if (occupancy.compareTo(threshold) >= 0) {
                String title = "Zone saturée : " + zone.getName();
                String message = "La zone « " + zone.getName() + " » est occupée à "
                        + occupancy.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP)
                        + " % (" + saturated + " Porteur(s) sur " + supports.size() + ").";
                boolean opened = alertService.openIfAbsent(SupervisionAlertType.ZONE_SATURATION,
                        AlertSeverity.AVERTISSEMENT, title, message, AlertService.AlertRef.zone(zone.getId()))
                        .isPresent();
                if (opened) {
                    changes++;
                    notificationService.notifyRoles(Set.of(RoleCode.ADMINISTRATEUR, RoleCode.SUPERVISEUR),
                            NotificationType.ZONE_SATURATION, AlertSeverity.AVERTISSEMENT, title, message,
                            "/admin/carte-chaleur?onglet=demande", "ZONE", String.valueOf(zone.getId()), Set.of());
                }
            } else if (occupancy.compareTo(threshold.subtract(new BigDecimal("0.10"))) < 0) {
                changes += alertService.resolve(SupervisionAlertType.ZONE_SATURATION,
                        AlertService.AlertRef.zone(zone.getId()));
            }
        }
        return changes;
    }

    private boolean isSaturated(DiffusionSupport support, LocalDate date, LocalTime time) {
        List<Reservation> live = reservationRepository.findActiveReservationsForSupportAt(support.getId(), date, time,
                ReservationStatus.CONFIRMEE);
        int capacity = support.getDiffusionCapacity() == null ? 1 : Math.max(1, support.getDiffusionCapacity());
        return live.size() >= capacity;
    }

    /** Pure rule: share of the ACTIF supports of a zone booked to capacity (0 when the zone has none). */
    public static BigDecimal occupancy(long saturatedSupports, int activeSupports) {
        if (activeSupports <= 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(saturatedSupports)
                .divide(BigDecimal.valueOf(activeSupports), 4, RoundingMode.HALF_UP);
    }
}
