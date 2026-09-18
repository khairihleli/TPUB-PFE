package com.example.zelqanepfe.service.supervision;

import com.example.zelqanepfe.dto.SupervisionAlertResponse;
import com.example.zelqanepfe.model.AlertSeverity;
import com.example.zelqanepfe.model.SupervisionAlert;
import com.example.zelqanepfe.model.SupervisionAlertType;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.SupervisionAlertRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.service.realtime.SupervisionBroadcastEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Opens and resolves supervision alerts (docs/round2-contract.md §5.3). Every change is pushed on the supervision
 * stream after commit.
 */
@Service
@RequiredArgsConstructor
public class AlertService {

    /** The entity an alert points at; every field is optional. */
    public record AlertRef(Long supportId, Long zoneId, Long emergencyId, Long campaignId) {

        public static AlertRef support(Long supportId) {
            return new AlertRef(supportId, null, null, null);
        }

        public static AlertRef zone(Long zoneId) {
            return new AlertRef(null, zoneId, null, null);
        }

        public static AlertRef emergency(Long emergencyId) {
            return new AlertRef(null, null, emergencyId, null);
        }

        public static AlertRef campaign(Long campaignId) {
            return new AlertRef(null, null, null, campaignId);
        }
    }

    private final SupervisionAlertRepository alertRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    /** Opens an alert unless an unresolved one of the same type already points at the same entity. */
    @Transactional
    public Optional<SupervisionAlert> openIfAbsent(SupervisionAlertType type, AlertSeverity severity, String title,
                                                   String message, AlertRef ref) {
        if (!findOpen(type, ref).isEmpty()) {
            return Optional.empty();
        }
        SupervisionAlert alert = alertRepository.save(SupervisionAlert.builder()
                .alertType(type)
                .severity(severity)
                .title(title)
                .message(message)
                .supportId(ref.supportId())
                .zoneId(ref.zoneId())
                .emergencyId(ref.emergencyId())
                .campaignId(ref.campaignId())
                .createdAt(Instant.now(clock))
                .build());
        publish(alert);
        return Optional.of(alert);
    }

    /** Resolves every open alert of that type pointing at the entity. Returns how many were closed. */
    @Transactional
    public int resolve(SupervisionAlertType type, AlertRef ref) {
        List<SupervisionAlert> open = findOpen(type, ref);
        Instant now = Instant.now(clock);
        for (SupervisionAlert alert : open) {
            alert.setResolvedAt(now);
            alertRepository.save(alert);
            publish(alert);
        }
        return open.size();
    }

    List<SupervisionAlert> findOpen(SupervisionAlertType type, AlertRef ref) {
        if (ref.supportId() != null) {
            return alertRepository.findByAlertTypeAndSupportIdAndResolvedAtIsNull(type, ref.supportId());
        }
        if (ref.zoneId() != null) {
            return alertRepository.findByAlertTypeAndZoneIdAndResolvedAtIsNull(type, ref.zoneId());
        }
        if (ref.emergencyId() != null) {
            return alertRepository.findByAlertTypeAndEmergencyIdAndResolvedAtIsNull(type, ref.emergencyId());
        }
        if (ref.campaignId() != null) {
            return alertRepository.findByAlertTypeAndCampaignIdAndResolvedAtIsNull(type, ref.campaignId());
        }
        return alertRepository.findByAlertTypeAndResolvedAtIsNull(type);
    }

    void publish(SupervisionAlert alert) {
        eventPublisher.publishEvent(new SupervisionBroadcastEvent("alert", toResponse(alert)));
    }

    public SupervisionAlertResponse toResponse(SupervisionAlert alert) {
        String acknowledgedBy = alert.getAcknowledgedByUserId() == null ? null
                : userRepository.findById(alert.getAcknowledgedByUserId()).map(User::getNom).orElse(null);
        return SupervisionAlertResponse.builder()
                .id(alert.getId())
                .type(alert.getAlertType().name())
                .severity(alert.getSeverity().name())
                .title(alert.getTitle())
                .message(alert.getMessage())
                .supportId(alert.getSupportId())
                .zoneId(alert.getZoneId())
                .emergencyId(alert.getEmergencyId())
                .campaignId(alert.getCampaignId())
                .createdAt(alert.getCreatedAt())
                .resolvedAt(alert.getResolvedAt())
                .acknowledgedAt(alert.getAcknowledgedAt())
                .acknowledgedByName(acknowledgedBy)
                .build();
    }
}
