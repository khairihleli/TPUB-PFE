package com.example.zelqanepfe.service.notification;

import com.example.zelqanepfe.config.SupervisionProperties;
import com.example.zelqanepfe.dto.NotificationResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.AlertSeverity;
import com.example.zelqanepfe.model.Notification;
import com.example.zelqanepfe.model.NotificationType;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.NotificationRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.RequestInfo;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.SecurityUtils;
import com.example.zelqanepfe.service.realtime.NotificationPushEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/** In-app notifications of the staff (docs/round2-contract.md §5.5). */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final SupervisionProperties.Notifications properties;
    private final Clock clock;

    /** Notifies every active user of the given roles, except {@code excludedUserIds}. */
    @Transactional
    public List<Notification> notifyRoles(Set<RoleCode> roles, NotificationType type, AlertSeverity severity,
                                          String title, String message, String link, String entityType,
                                          String entityId, Set<Long> excludedUserIds) {
        List<Notification> created = new ArrayList<>();
        for (User user : activeUsersOf(roles)) {
            if (excludedUserIds != null && excludedUserIds.contains(user.getId())) {
                continue;
            }
            created.add(notifyUser(user, type, severity, title, message, link, entityType, entityId));
        }
        return created;
    }

    @Transactional
    public Notification notifyUser(User user, NotificationType type, AlertSeverity severity, String title,
                                   String message, String link, String entityType, String entityId) {
        Notification notification = notificationRepository.save(Notification.builder()
                .recipientUserId(user.getId())
                .type(type)
                .severity(severity)
                .title(RequestInfo.truncate(title, 200))
                .message(RequestInfo.truncate(message, 1000))
                .link(RequestInfo.truncate(link, 300))
                .entityType(RequestInfo.truncate(entityType, 40))
                .entityId(RequestInfo.truncate(entityId, 64))
                .createdAt(Instant.now(clock))
                .build());
        eventPublisher.publishEvent(new NotificationPushEvent(user.getId(), user.getEmail(), toResponse(notification)));
        return notification;
    }

    /** Active users of the given roles (a notification never reaches a disabled account). */
    @Transactional(readOnly = true)
    public List<User> activeUsersOf(Collection<RoleCode> roles) {
        if (roles == null || roles.isEmpty()) {
            return List.of();
        }
        Specification<User> specification = (root, query, cb) -> cb.and(
                cb.isTrue(root.get("isActive")),
                root.get("role").get("code").in(roles));
        return userRepository.findAll(specification);
    }

    @Transactional(readOnly = true)
    public PageResponse<NotificationResponse> list(boolean unreadOnly, int page, int size) {
        Long userId = currentUserId();
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)),
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<Notification> result = unreadOnly
                ? notificationRepository.findByRecipientUserIdAndReadAtIsNull(userId, pageable)
                : notificationRepository.findByRecipientUserId(userId, pageable);
        return PageResponse.of(result.map(NotificationService::toResponse));
    }

    @Transactional(readOnly = true)
    public long unreadCount() {
        return notificationRepository.countByRecipientUserIdAndReadAtIsNull(currentUserId());
    }

    /** Marks one of the caller's notifications as read. Someone else's or unknown → 404. */
    @Transactional
    public void markRead(Long id) {
        Long userId = currentUserId();
        Notification notification = notificationRepository.findByIdAndRecipientUserId(id, userId)
                .orElseThrow(() -> new com.example.zelqanepfe.exception.ApiException(HttpStatus.NOT_FOUND,
                        "NOTIFICATION_NOT_FOUND", "Notification introuvable."));
        if (notification.getReadAt() == null) {
            notification.setReadAt(Instant.now(clock));
            notificationRepository.save(notification);
        }
    }

    @Transactional
    public int markAllRead() {
        return notificationRepository.markAllRead(currentUserId(), Instant.now(clock));
    }

    /** Deletes read notifications older than the retention (daily scheduler). */
    @Transactional
    public int purge() {
        Instant threshold = Instant.now(clock).minus(Duration.ofDays(Math.max(1, properties.getRetentionDays())));
        return notificationRepository.deleteReadOlderThan(threshold);
    }

    private Long currentUserId() {
        UserDetailsImpl user = SecurityUtils.getCurrentUser();
        return user.getId();
    }

    public static NotificationResponse toResponse(Notification notification) {
        return NotificationResponse.builder()
                .id(notification.getId())
                .type(notification.getType().name())
                .severity(notification.getSeverity().name())
                .title(notification.getTitle())
                .message(notification.getMessage())
                .link(notification.getLink())
                .entityType(notification.getEntityType())
                .entityId(notification.getEntityId())
                .createdAt(notification.getCreatedAt())
                .readAt(notification.getReadAt())
                .build();
    }
}
