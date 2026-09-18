package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.ApprovalResponse;
import com.example.zelqanepfe.dto.EmergencyLiveEvent;
import com.example.zelqanepfe.dto.EmergencyRequest;
import com.example.zelqanepfe.dto.EmergencyResponse;
import com.example.zelqanepfe.dto.PendingEmergencyApproval;
import com.example.zelqanepfe.model.AlertSeverity;
import com.example.zelqanepfe.model.Approval;
import com.example.zelqanepfe.model.ApprovalDecision;
import com.example.zelqanepfe.model.ApprovalEntityType;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.EmergencyApprovalStatus;
import com.example.zelqanepfe.model.EmergencyMessage;
import com.example.zelqanepfe.model.EmergencyStopReason;
import com.example.zelqanepfe.model.NotificationType;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.SupervisionAlertType;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.UrgencyLevel;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.EmergencyMessageRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.approval.ApprovalErrors;
import com.example.zelqanepfe.service.approval.ApprovalPolicy;
import com.example.zelqanepfe.service.notification.NotificationService;
import com.example.zelqanepfe.service.realtime.SupervisionBroadcastEvent;
import com.example.zelqanepfe.service.supervision.AlertService;
import com.example.zelqanepfe.util.GeoUtils;
import com.example.zelqanepfe.util.TargetingGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
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
import java.util.Set;

/**
 * Emergency messages v2 (contract §2.8): datetime window, map circle or zone target, urgency, state and stop
 * tracking, plus the multi-level approval of round 2 (docs/round2-contract.md §5.4).
 */
@Service
@RequiredArgsConstructor
public class EmergencyService {

    static final LocalTime DEFAULT_END = LocalTime.of(23, 59, 59);
    static final int DEFAULT_DURATION = 15;

    public enum State { PROGRAMME, EN_COURS, TERMINE, DESACTIVE, EN_ATTENTE_APPROBATION, REFUSE }

    private final EmergencyMessageRepository emergencyMessageRepository;
    private final ZoneService zoneService;
    private final ZoneRepository zoneRepository;
    private final UserRepository userRepository;
    private final DiffusionSupportRepository supportRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final AuditService auditService;
    private final ApprovalPolicy approvalPolicy;
    private final AlertService alertService;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Transactional
    public EmergencyResponse create(EmergencyRequest request) {
        EmergencyTargeting.Target target = EmergencyTargeting.resolve(request, zoneService, zoneRepository);
        boolean fullCircle = target.circle();
        LocalTime startTime = request.getStartTime() != null ? request.getStartTime() : LocalTime.MIDNIGHT;
        LocalTime endTime = request.getEndTime() != null ? request.getEndTime() : DEFAULT_END;
        LocalDateTime startAt = request.getStartDate().atTime(startTime);
        LocalDateTime endAt = request.getEndDate().atTime(endTime);
        if (!endAt.isAfter(startAt) || !endAt.isAfter(LocalDateTime.now(clock))) {
            throw NetworkErrors.invalidEmergencyWindow();
        }
        Zone zone = target.zone();
        UserDetailsImpl current = CampaignAccessGuard.currentUser();
        User creator = current == null ? null : userRepository.findById(current.getId()).orElse(null);
        if (creator == null) {
            throw CampaignErrors.validationFailed("createdBy", "Utilisateur courant introuvable.");
        }
        // Multi-level approval: the creation counts as the first approval (docs/round2-contract.md §5.4).
        int required = approvalPolicy.effective(approvalPolicy.configuredForEmergency());
        boolean pending = required > 1;
        Instant now = Instant.now(clock);
        EmergencyMessage message = EmergencyMessage.builder()
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .zone(zone)
                .latitude(fullCircle ? request.getLatitude().setScale(7, RoundingMode.HALF_UP) : null)
                .longitude(fullCircle ? request.getLongitude().setScale(7, RoundingMode.HALF_UP) : null)
                .radiusKm(fullCircle ? request.getRadiusKm().setScale(3, RoundingMode.HALF_UP) : null)
                .targetPolygon(target.polygon())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(startTime)
                .endTime(endTime)
                .durationSeconds((short) (request.getDurationSeconds() != null ? request.getDurationSeconds() : DEFAULT_DURATION))
                .priority((short) (request.getPriority() != null ? request.getPriority() : 1))
                .urgencyLevel(request.getUrgencyLevel() != null ? request.getUrgencyLevel() : UrgencyLevel.HIGH)
                .isActive(true)
                .approvalStatus(pending ? EmergencyApprovalStatus.EN_ATTENTE : EmergencyApprovalStatus.APPROUVE)
                .approvalsRequired((short) required)
                .approvedAt(pending ? null : now)
                .createdByUser(creator)
                .build();
        EmergencyMessage saved = emergencyMessageRepository.save(message);
        approvalPolicy.record(ApprovalEntityType.EMERGENCY, saved.getId(), ApprovalPolicy.EMERGENCY_CYCLE,
                creator.getId(), ApprovalDecision.APPROUVE, null, Map.of("creation", true));

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("zoneId", zone.getId());
        details.put("urgencyLevel", saved.getUrgencyLevel().name());
        details.put("startAt", startAt.toString());
        details.put("endAt", endAt.toString());
        details.put("approvalsRequired", required);
        if (fullCircle) {
            details.put("latitude", saved.getLatitude());
            details.put("longitude", saved.getLongitude());
            details.put("radiusKm", saved.getRadiusKm());
        }
        auditService.record("EMERGENCY_CREATED", "EMERGENCY", saved.getId(),
                "Création du message d'urgence « " + saved.getTitle() + " »", details);

        if (pending) {
            openApprovalAlert(saved, creator);
        } else {
            notifyBroadcast(saved);
        }
        List<DiffusionSupport> supports = supportRepository.findAll();
        publishLive(saved, supports);
        return toResponse(saved, supports);
    }

    /** Second (or n-th) administrator approving a pending message (docs/round2-contract.md §5.4). */
    @Transactional
    public EmergencyResponse approve(Long id, String comment) {
        EmergencyMessage message = emergencyMessageRepository.findById(id).orElseThrow(NetworkErrors::emergencyNotFound);
        if (approvalStatus(message) != EmergencyApprovalStatus.EN_ATTENTE) {
            throw ApprovalErrors.notPending();
        }
        if (!Boolean.TRUE.equals(message.getIsActive()) || DiffusionService.endAt(message).isBefore(LocalDateTime.now(clock))) {
            throw ApprovalErrors.emergencyNotApprovable();
        }
        Long approverId = currentUserId();
        List<Approval> existing = approvalPolicy.approvals(ApprovalEntityType.EMERGENCY, message.getId(),
                ApprovalPolicy.EMERGENCY_CYCLE);
        if (ApprovalPolicy.approved(existing).stream().anyMatch(a -> approverId.equals(a.getApproverUserId()))) {
            throw ApprovalErrors.alreadyGiven();
        }
        approvalPolicy.record(ApprovalEntityType.EMERGENCY, message.getId(), ApprovalPolicy.EMERGENCY_CYCLE,
                approverId, ApprovalDecision.APPROUVE, comment, null);
        int approvals = ApprovalPolicy.approved(approvalPolicy.approvals(ApprovalEntityType.EMERGENCY, message.getId(),
                ApprovalPolicy.EMERGENCY_CYCLE)).size();
        int required = requiredApprovals(message);
        boolean broadcast = approvals >= required;
        if (broadcast) {
            message.setApprovalStatus(EmergencyApprovalStatus.APPROUVE);
            message.setApprovedAt(Instant.now(clock));
            message = emergencyMessageRepository.save(message);
            alertService.resolve(SupervisionAlertType.EMERGENCY_PENDING_APPROVAL,
                    AlertService.AlertRef.emergency(message.getId()));
            notifyBroadcast(message);
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("approvals", approvals);
        details.put("approvalsRequired", required);
        details.put("broadcast", broadcast);
        auditService.record("EMERGENCY_APPROVED", "APPROVAL", message.getId(),
                "Approbation du message d'urgence « " + message.getTitle() + " » (" + approvals + "/" + required + ")",
                details);
        List<DiffusionSupport> supports = supportRepository.findAll();
        publishLive(message, supports);
        return toResponse(message, supports);
    }

    /** Refusal of a pending message by another administrator (docs/round2-contract.md §5.4). */
    @Transactional
    public EmergencyResponse refuse(Long id, String rawReason) {
        String reason = rawReason == null ? null : rawReason.trim();
        if (reason == null || reason.length() < 3 || reason.length() > 500) {
            throw ApprovalErrors.refusalReasonRequired();
        }
        EmergencyMessage message = emergencyMessageRepository.findById(id).orElseThrow(NetworkErrors::emergencyNotFound);
        if (approvalStatus(message) != EmergencyApprovalStatus.EN_ATTENTE) {
            throw ApprovalErrors.notPending();
        }
        Long approverId = currentUserId();
        if (message.getCreatedByUser() != null && approverId.equals(message.getCreatedByUser().getId())) {
            throw ApprovalErrors.selfRefusal();
        }
        Instant now = Instant.now(clock);
        message.setApprovalStatus(EmergencyApprovalStatus.REFUSE);
        message.setIsActive(false);
        message.setStoppedAt(now);
        message.setStopReason(EmergencyStopReason.REFUSE);
        EmergencyMessage saved = emergencyMessageRepository.save(message);
        approvalPolicy.record(ApprovalEntityType.EMERGENCY, saved.getId(), ApprovalPolicy.EMERGENCY_CYCLE,
                approverId, ApprovalDecision.REFUSE, reason, null);
        alertService.resolve(SupervisionAlertType.EMERGENCY_PENDING_APPROVAL,
                AlertService.AlertRef.emergency(saved.getId()));
        if (saved.getCreatedByUser() != null) {
            notificationService.notifyUser(saved.getCreatedByUser(), NotificationType.EMERGENCY_REFUSED,
                    AlertSeverity.AVERTISSEMENT, "Message prioritaire refusé : " + saved.getTitle(),
                    "Motif : " + reason, "/admin/urgences", "EMERGENCY", String.valueOf(saved.getId()));
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reason", reason);
        auditService.record("EMERGENCY_REFUSED", "APPROVAL", saved.getId(),
                "Refus du message d'urgence « " + saved.getTitle() + " »", details);
        List<DiffusionSupport> supports = supportRepository.findAll();
        publishLive(saved, supports);
        return toResponse(saved, supports);
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
            alertService.resolve(SupervisionAlertType.EMERGENCY_PENDING_APPROVAL,
                    AlertService.AlertRef.emergency(message.getId()));
            auditService.record("EMERGENCY_DEACTIVATED", "EMERGENCY", message.getId(),
                    "Arrêt manuel du message d'urgence « " + message.getTitle() + " »", null);
        }
        List<DiffusionSupport> supports = supportRepository.findAll();
        publishLive(message, supports);
        return toResponse(message, supports);
    }

    /** Messages of the supervision snapshot: running, scheduled or waiting for an approval. */
    @Transactional(readOnly = true)
    public List<EmergencyLiveEvent> liveEvents() {
        List<DiffusionSupport> supports = supportRepository.findAll();
        LocalDateTime now = LocalDateTime.now(clock);
        return emergencyMessageRepository.findAllByOrderByCreatedAtDescIdDesc().stream()
                .filter(m -> {
                    State state = state(m, now);
                    return state == State.EN_COURS || state == State.PROGRAMME
                            || state == State.EN_ATTENTE_APPROBATION;
                })
                .map(m -> liveEvent(m, supports))
                .toList();
    }

    /** Messages waiting for their remaining approvals, for {@code GET /api/approvals/pending}. */
    @Transactional(readOnly = true)
    public List<PendingEmergencyApproval> pendingApprovals(Long currentAdminId, boolean canApprove) {
        return emergencyMessageRepository
                .findByApprovalStatusAndIsActiveTrueOrderByCreatedAtDescIdDesc(EmergencyApprovalStatus.EN_ATTENTE)
                .stream()
                .map(message -> {
                    List<ApprovalResponse> approvals = approvalsOf(message);
                    boolean already = approvals.stream()
                            .anyMatch(a -> "APPROUVE".equals(a.getDecision())
                                    && a.getApproverUserId() != null
                                    && a.getApproverUserId().equals(currentAdminId));
                    return PendingEmergencyApproval.builder()
                            .emergencyId(message.getId())
                            .title(message.getTitle())
                            .urgencyLevel(message.getUrgencyLevel().name())
                            .zoneName(message.getZone() == null ? null : message.getZone().getName())
                            .startDate(message.getStartDate())
                            .endDate(message.getEndDate())
                            .createdByName(message.getCreatedByUser() == null ? null : message.getCreatedByUser().getNom())
                            .approvalsRequired(requiredApprovals(message))
                            .approvals(approvals)
                            .canApprove(canApprove && !already)
                            .requestedAt(message.getCreatedAt())
                            .build();
                })
                .toList();
    }

    // --- derived state --------------------------------------------------------------------------------------------

    static EmergencyApprovalStatus approvalStatus(EmergencyMessage message) {
        return message.getApprovalStatus() == null ? EmergencyApprovalStatus.APPROUVE : message.getApprovalStatus();
    }

    static State state(EmergencyMessage message, LocalDateTime now) {
        if (!Boolean.TRUE.equals(message.getIsActive())) {
            if (message.getStopReason() == EmergencyStopReason.REFUSE
                    || approvalStatus(message) == EmergencyApprovalStatus.REFUSE) {
                return State.REFUSE;
            }
            return message.getStopReason() == EmergencyStopReason.AUTO ? State.TERMINE : State.DESACTIVE;
        }
        if (now.isAfter(DiffusionService.endAt(message))) {
            return State.TERMINE;
        }
        if (approvalStatus(message) == EmergencyApprovalStatus.EN_ATTENTE) {
            return State.EN_ATTENTE_APPROBATION;
        }
        if (now.isBefore(DiffusionService.startAt(message))) {
            return State.PROGRAMME;
        }
        return State.EN_COURS;
    }

    static long affectedSupports(EmergencyMessage message, List<DiffusionSupport> supports) {
        return supports.stream()
                .filter(s -> s.getTechnicalStatus() == TechnicalStatus.ACTIF)
                .filter(s -> TargetingGeometry.emergencyTargets(message, s))
                .count();
    }

    // --- helpers --------------------------------------------------------------------------------------------------

    private int requiredApprovals(EmergencyMessage message) {
        return message.getApprovalsRequired() == null || message.getApprovalsRequired() < 1
                ? 1 : message.getApprovalsRequired();
    }

    private Long currentUserId() {
        UserDetailsImpl current = CampaignAccessGuard.currentUser();
        if (current == null) {
            throw CampaignErrors.validationFailed("approver", "Utilisateur courant introuvable.");
        }
        return current.getId();
    }

    private List<ApprovalResponse> approvalsOf(EmergencyMessage message) {
        return message.getId() == null ? List.of() : approvalPolicy.toResponses(
                approvalPolicy.approvals(ApprovalEntityType.EMERGENCY, message.getId(), ApprovalPolicy.EMERGENCY_CYCLE));
    }

    private void openApprovalAlert(EmergencyMessage message, User creator) {
        String title = "Message prioritaire à approuver : " + message.getTitle();
        String text = "Le message « " + message.getTitle() + " » attend l'approbation d'un second administrateur "
                + "avant d'être diffusé.";
        alertService.openIfAbsent(SupervisionAlertType.EMERGENCY_PENDING_APPROVAL, AlertSeverity.CRITIQUE, title, text,
                AlertService.AlertRef.emergency(message.getId()));
        notificationService.notifyRoles(Set.of(RoleCode.ADMINISTRATEUR), NotificationType.EMERGENCY_APPROVAL_REQUIRED,
                AlertSeverity.CRITIQUE, title, text, "/admin/approbations", "EMERGENCY",
                String.valueOf(message.getId()), Set.of(creator.getId()));
    }

    private void notifyBroadcast(EmergencyMessage message) {
        notificationService.notifyRoles(
                Set.of(RoleCode.ADMINISTRATEUR, RoleCode.SUPERVISEUR, RoleCode.OPERATEUR),
                NotificationType.EMERGENCY_BROADCAST, AlertSeverity.CRITIQUE,
                "Message prioritaire diffusé : " + message.getTitle(), message.getContent(), "/admin/urgences",
                "EMERGENCY", String.valueOf(message.getId()), Set.of());
    }

    private void publishLive(EmergencyMessage message, List<DiffusionSupport> supports) {
        eventPublisher.publishEvent(new SupervisionBroadcastEvent("emergency", liveEvent(message, supports)));
    }

    EmergencyLiveEvent liveEvent(EmergencyMessage message, List<DiffusionSupport> supports) {
        List<ApprovalResponse> approvals = approvalsOf(message);
        return EmergencyLiveEvent.builder()
                .emergencyId(message.getId())
                .title(message.getTitle())
                .urgencyLevel(message.getUrgencyLevel().name())
                .state(state(message, LocalDateTime.now(clock)).name())
                .approvalStatus(approvalStatus(message).name())
                .approvalsCount((int) approvals.stream().filter(a -> "APPROUVE".equals(a.getDecision())).count())
                .approvalsRequired(requiredApprovals(message))
                .affectedSupports(affectedSupports(message, supports))
                .build();
    }

    private EmergencyResponse toResponse(EmergencyMessage message, List<DiffusionSupport> supports) {
        List<ApprovalResponse> approvals = approvalsOf(message);
        return EmergencyResponse.builder()
                .id(message.getId())
                .title(message.getTitle())
                .content(message.getContent())
                .zoneId(message.getZone().getId())
                .zoneName(message.getZone().getName())
                .latitude(message.getLatitude())
                .longitude(message.getLongitude())
                .radiusKm(message.getRadiusKm())
                .targetPolygon(message.getTargetPolygon())
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
                .approvalStatus(approvalStatus(message).name())
                .approvalsRequired(requiredApprovals(message))
                .approvalsRequiredConfigured(approvalPolicy.configuredForEmergency())
                .approvals(approvals)
                .approvedAt(message.getApprovedAt())
                .build();
    }
}
