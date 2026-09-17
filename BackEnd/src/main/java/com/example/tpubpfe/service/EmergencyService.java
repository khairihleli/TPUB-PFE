package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.EmergencyRequest;
import com.example.tpubpfe.dto.EmergencyResponse;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.EmergencyStopReason;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.util.GeoUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Emergency messages v2 (contract §2.8): datetime window, map circle or zone target, urgency, state and stop tracking.
 */
@Service
@RequiredArgsConstructor
public class EmergencyService {

    static final LocalTime DEFAULT_END = LocalTime.of(23, 59, 59);
    static final int DEFAULT_DURATION = 15;

    public enum State { PROGRAMME, EN_COURS, TERMINE, DESACTIVE }

    private final EmergencyMessageRepository emergencyMessageRepository;
    private final ZoneService zoneService;
    private final ZoneRepository zoneRepository;
    private final UserRepository userRepository;
    private final DiffusionSupportRepository supportRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final AuditService auditService;
    private final Clock clock;

    @Transactional
    public EmergencyResponse create(EmergencyRequest request) {
        boolean anyCircle = request.getLatitude() != null || request.getLongitude() != null || request.getRadiusKm() != null;
        boolean fullCircle = request.getLatitude() != null && request.getLongitude() != null && request.getRadiusKm() != null;
        if (anyCircle && !fullCircle) {
            throw NetworkErrors.emergencyTargetRequired();
        }
        if (request.getZoneId() == null && !fullCircle) {
            throw NetworkErrors.emergencyTargetRequired();
        }
        LocalTime startTime = request.getStartTime() != null ? request.getStartTime() : LocalTime.MIDNIGHT;
        LocalTime endTime = request.getEndTime() != null ? request.getEndTime() : DEFAULT_END;
        LocalDateTime startAt = request.getStartDate().atTime(startTime);
        LocalDateTime endAt = request.getEndDate().atTime(endTime);
        if (!endAt.isAfter(startAt) || !endAt.isAfter(LocalDateTime.now(clock))) {
            throw NetworkErrors.invalidEmergencyWindow();
        }
        Zone zone;
        if (request.getZoneId() != null) {
            zone = zoneService.findZone(request.getZoneId());
        } else {
            zone = CampaignZoneService.resolveZone(request.getLatitude().doubleValue(), request.getLongitude().doubleValue(),
                    zoneRepository.findByIsActiveTrue()).orElseThrow(CampaignErrors::invalidZone);
        }
        UserDetailsImpl current = CampaignAccessGuard.currentUser();
        User creator = current == null ? null : userRepository.findById(current.getId()).orElse(null);
        if (creator == null) {
            throw CampaignErrors.validationFailed("createdBy", "Utilisateur courant introuvable.");
        }
        EmergencyMessage message = EmergencyMessage.builder()
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .zone(zone)
                .latitude(fullCircle ? request.getLatitude().setScale(7, RoundingMode.HALF_UP) : null)
                .longitude(fullCircle ? request.getLongitude().setScale(7, RoundingMode.HALF_UP) : null)
                .radiusKm(fullCircle ? request.getRadiusKm().setScale(3, RoundingMode.HALF_UP) : null)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(startTime)
                .endTime(endTime)
                .durationSeconds((short) (request.getDurationSeconds() != null ? request.getDurationSeconds() : DEFAULT_DURATION))
                .priority((short) (request.getPriority() != null ? request.getPriority() : 1))
                .urgencyLevel(request.getUrgencyLevel() != null ? request.getUrgencyLevel() : UrgencyLevel.HIGH)
                .isActive(true)
                .createdByUser(creator)
                .build();
        EmergencyMessage saved = emergencyMessageRepository.save(message);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("zoneId", zone.getId());
        details.put("urgencyLevel", saved.getUrgencyLevel().name());
        details.put("startAt", startAt.toString());
        details.put("endAt", endAt.toString());
        if (fullCircle) {
            details.put("latitude", saved.getLatitude());
            details.put("longitude", saved.getLongitude());
            details.put("radiusKm", saved.getRadiusKm());
        }
        auditService.record("EMERGENCY_CREATED", "EMERGENCY", saved.getId(),
                "Création du message d'urgence « " + saved.getTitle() + " »", details);
        return toResponse(saved, supportRepository.findAll());
    }

    @Transactional(readOnly = true)
    public List<EmergencyResponse> getAll() {
        return getAll(null);
    }

    /** Newest first, optionally filtered by derived state. */
    @Transactional(readOnly = true)
    public List<EmergencyResponse> getAll(String state) {
        State filter = null;
        if (state != null && !state.isBlank()) {
            try {
                filter = State.valueOf(state.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                throw CampaignErrors.invalidParameter("state", "Valeur invalide pour state : " + state);
            }
        }
        List<DiffusionSupport> supports = supportRepository.findAll();
        LocalDateTime now = LocalDateTime.now(clock);
        State wanted = filter;
        return emergencyMessageRepository.findAllByOrderByCreatedAtDescIdDesc().stream()
                .filter(m -> wanted == null || state(m, now) == wanted)
                .map(m -> toResponse(m, supports))
                .toList();
    }

    @Transactional
    public EmergencyResponse deactivate(Long id) {
        EmergencyMessage message = emergencyMessageRepository.findById(id).orElseThrow(NetworkErrors::emergencyNotFound);
        if (Boolean.TRUE.equals(message.getIsActive())) {
            message.setIsActive(false);
            message.setStoppedAt(Instant.now(clock));
            message.setStopReason(EmergencyStopReason.MANUEL);
            message = emergencyMessageRepository.save(message);
            auditService.record("EMERGENCY_DEACTIVATED", "EMERGENCY", message.getId(),
                    "Arrêt manuel du message d'urgence « " + message.getTitle() + " »", null);
        }
        return toResponse(message, supportRepository.findAll());
    }

    static State state(EmergencyMessage message, LocalDateTime now) {
        if (!Boolean.TRUE.equals(message.getIsActive())) {
            return message.getStopReason() == EmergencyStopReason.AUTO ? State.TERMINE : State.DESACTIVE;
        }
        if (now.isBefore(DiffusionService.startAt(message))) {
            return State.PROGRAMME;
        }
        if (now.isAfter(DiffusionService.endAt(message))) {
            return State.TERMINE;
        }
        return State.EN_COURS;
    }

    static long affectedSupports(EmergencyMessage message, List<DiffusionSupport> supports) {
        return supports.stream()
                .filter(s -> s.getTechnicalStatus() == TechnicalStatus.ACTIF)
                .filter(s -> {
                    if (message.getLatitude() != null && message.getLongitude() != null && message.getRadiusKm() != null) {
                        return GeoUtils.within(s.getLatitude().doubleValue(), s.getLongitude().doubleValue(),
                                message.getLatitude().doubleValue(), message.getLongitude().doubleValue(),
                                message.getRadiusKm().doubleValue());
                    }
                    return s.getZone() != null && message.getZone() != null
                            && s.getZone().getId().equals(message.getZone().getId());
                })
                .count();
    }

    private EmergencyResponse toResponse(EmergencyMessage message, List<DiffusionSupport> supports) {
        return EmergencyResponse.builder()
                .id(message.getId())
                .title(message.getTitle())
                .content(message.getContent())
                .zoneId(message.getZone().getId())
                .zoneName(message.getZone().getName())
                .latitude(message.getLatitude())
                .longitude(message.getLongitude())
                .radiusKm(message.getRadiusKm())
                .startDate(message.getStartDate())
                .endDate(message.getEndDate())
                .startTime(message.getStartTime() != null ? message.getStartTime() : LocalTime.MIDNIGHT)
                .endTime(message.getEndTime() != null ? message.getEndTime() : DEFAULT_END)
                .durationSeconds(message.getDurationSeconds() != null ? message.getDurationSeconds().intValue() : DEFAULT_DURATION)
                .priority(message.getPriority())
                .urgencyLevel(message.getUrgencyLevel().name())
                .isActive(message.getIsActive())
                .state(state(message, LocalDateTime.now(clock)).name())
                .stoppedAt(message.getStoppedAt())
                .stopReason(message.getStopReason() != null ? message.getStopReason().name() : null)
                .affectedSupports(affectedSupports(message, supports))
                .diffusionCount(message.getId() == null ? 0 : diffusionLogRepository.countByEmergencyId(message.getId()))
                .createdByName(message.getCreatedByUser() != null ? message.getCreatedByUser().getNom() : null)
                .createdAt(message.getCreatedAt())
                .build();
    }
}
