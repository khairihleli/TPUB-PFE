package com.example.zelqanepfe.service.supervision;

import com.example.zelqanepfe.config.SupervisionProperties;
import com.example.zelqanepfe.dto.HeartbeatRequest;
import com.example.zelqanepfe.dto.HeartbeatResponse;
import com.example.zelqanepfe.dto.PresenceEvent;
import com.example.zelqanepfe.model.AlertSeverity;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.NotificationType;
import com.example.zelqanepfe.model.PresenceState;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.SupervisionAlertType;
import com.example.zelqanepfe.model.SupportPresence;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.SupportPresenceRepository;
import com.example.zelqanepfe.service.NetworkErrors;
import com.example.zelqanepfe.service.notification.NotificationService;
import com.example.zelqanepfe.service.realtime.SupervisionBroadcastEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Player presence (docs/round2-contract.md §5.2): heartbeats, the offline sweep and the alerts and notifications
 * they raise.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PresenceService {

    private final SupportPresenceRepository presenceRepository;
    private final DiffusionSupportRepository supportRepository;
    private final AlertService alertService;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher eventPublisher;
    private final SupervisionProperties.Supervision properties;
    private final Clock clock;

    /** Heartbeat of a paired player. Unknown support → 404 {@code SUPPORT_NOT_FOUND}. */
    @Transactional
    public HeartbeatResponse heartbeat(Long supportId, HeartbeatRequest request, String ip) {
        if (supportId == null) {
            throw NetworkErrors.missingParameter("supportId", "Paramètre obligatoire : supportId.");
        }
        DiffusionSupport support = supportRepository.findById(supportId).orElseThrow(NetworkErrors::supportNotFound);
        HeartbeatRequest body = request == null ? new HeartbeatRequest() : request;
        touch(support.getId(), ip, body.getPlayerVersion(), body.getCurrentDiffusionLogId());
        return HeartbeatResponse.builder()
                .supportId(support.getId())
                .state(PresenceState.EN_LIGNE.name())
                .serverTime(Instant.now(clock))
                .nextHeartbeatSeconds(properties.getHeartbeatIntervalSeconds())
                .build();
    }

    /**
     * Records activity of a player: upsert of {@code support_presence}. A support coming back online resolves its
     * open offline alert and pushes a {@code presence} event.
     */
    @Transactional
    public Optional<PresenceEvent> touch(Long supportId, String ip, String playerVersion, Long diffusionLogId) {
        Instant now = Instant.now(clock);
        SupportPresence presence = presenceRepository.findById(supportId).orElse(null);
        boolean cameOnline = presence == null || presence.getState() != PresenceState.EN_LIGNE;
        if (presence == null) {
            presence = SupportPresence.builder().supportId(supportId).state(PresenceState.EN_LIGNE)
                    .lastHeartbeatAt(now).stateChangedAt(now).build();
        }
        presence.setLastHeartbeatAt(now);
        presence.setState(PresenceState.EN_LIGNE);
        if (cameOnline) {
            presence.setStateChangedAt(now);
        }
        if (ip != null) {
            presence.setLastIp(ip.length() > 64 ? ip.substring(0, 64) : ip);
        }
        if (playerVersion != null && !playerVersion.isBlank()) {
            presence.setPlayerVersion(playerVersion.length() > 40 ? playerVersion.substring(0, 40) : playerVersion);
        }
        if (diffusionLogId != null) {
            presence.setCurrentDiffusionLogId(diffusionLogId);
        }
        presenceRepository.save(presence);
        if (!cameOnline) {
            return Optional.empty();
        }
        alertService.resolve(SupervisionAlertType.SUPPORT_OFFLINE, AlertService.AlertRef.support(supportId));
        PresenceEvent event = event(presence);
        eventPublisher.publishEvent(new SupervisionBroadcastEvent("presence", event));
        return Optional.of(event);
    }

    /**
     * Marks as {@code HORS_LIGNE} every player whose last heartbeat is older than the timeout, opens a
     * {@code SUPPORT_OFFLINE} alert for supports whose technical status is ACTIF and notifies the staff.
     */
    @Transactional
    public int sweep() {
        Instant now = Instant.now(clock);
        Instant threshold = now.minus(Duration.ofSeconds(properties.getOfflineTimeoutSeconds()));
        List<SupportPresence> stale = presenceRepository
                .findByStateAndLastHeartbeatAtBefore(PresenceState.EN_LIGNE, threshold);
        for (SupportPresence presence : stale) {
            presence.setState(PresenceState.HORS_LIGNE);
            presence.setStateChangedAt(now);
            presenceRepository.save(presence);
            eventPublisher.publishEvent(new SupervisionBroadcastEvent("presence", event(presence)));
            supportRepository.findById(presence.getSupportId())
                    .filter(support -> support.getTechnicalStatus() == TechnicalStatus.ACTIF)
                    .ifPresent(support -> raiseOffline(support));
        }
        if (!stale.isEmpty()) {
            log.info("Écrans passés hors ligne : {}", stale.size());
        }
        return stale.size();
    }

    private void raiseOffline(DiffusionSupport support) {
        String title = "Écran hors ligne : " + support.getName();
        String message = "Le Porteur « " + support.getName() + " » n'a plus donné signe de vie depuis "
                + properties.getOfflineTimeoutSeconds() + " secondes.";
        alertService.openIfAbsent(SupervisionAlertType.SUPPORT_OFFLINE, AlertSeverity.CRITIQUE, title, message,
                        AlertService.AlertRef.support(support.getId()))
                .ifPresent(alert -> notificationService.notifyRoles(
                        Set.of(RoleCode.ADMINISTRATEUR, RoleCode.SUPERVISEUR, RoleCode.OPERATEUR),
                        NotificationType.SUPPORT_OFFLINE, AlertSeverity.CRITIQUE, title, message,
                        "/admin/supervision?porteur=" + support.getId(), "SUPPORT", String.valueOf(support.getId()),
                        Set.of()));
    }

    /** Presence of a support, {@code INCONNU} when it never reported. */
    @Transactional(readOnly = true)
    public String presenceOf(Long supportId) {
        return presenceRepository.findById(supportId).map(p -> p.getState().name()).orElse("INCONNU");
    }

    static PresenceEvent event(SupportPresence presence) {
        return PresenceEvent.builder()
                .supportId(presence.getSupportId())
                .presence(presence.getState().name())
                .lastHeartbeatAt(presence.getLastHeartbeatAt())
                .changedAt(presence.getStateChangedAt())
                .build();
    }
}
