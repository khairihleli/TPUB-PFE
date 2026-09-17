package com.example.tpubpfe.service.supervision;

import com.example.tpubpfe.dto.DiffusionLiveEvent;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.NotificationRepository;
import com.example.tpubpfe.service.realtime.DiffusionRecordedEvent;
import com.example.tpubpfe.service.realtime.NotificationPushEvent;
import com.example.tpubpfe.service.realtime.SseHub;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Turns a recorded diffusion into a live feed event and refreshes the presence of its player
 * (docs/round2-contract.md §5.2, §5.3). Runs on the realtime thread, after the diffusion transaction committed.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DiffusionFeedService {

    private final DiffusionLogRepository diffusionLogRepository;
    private final NotificationRepository notificationRepository;
    private final PresenceService presenceService;
    private final SseHub hub;

    @Transactional
    public void handle(DiffusionRecordedEvent event) {
        DiffusionLog log = diffusionLogRepository.findById(event.diffusionLogId()).orElse(null);
        if (log == null) {
            return;
        }
        hub.broadcast(SseHub.Channel.SUPERVISION, "diffusion", toEvent(log));
        presenceService.touch(event.supportId(), null, null, event.diffusionLogId())
                .ifPresent(presence -> hub.broadcast(SseHub.Channel.SUPERVISION, "presence", presence));
    }

    /** Pushes a notification and the new unread counter to its recipient. */
    @Transactional(readOnly = true)
    public void pushNotification(NotificationPushEvent event) {
        hub.sendToUser(SseHub.Channel.NOTIFICATIONS, event.recipientUserId(), "notification", event.notification());
        long unread = notificationRepository.countByRecipientUserIdAndReadAtIsNull(event.recipientUserId());
        hub.sendToUser(SseHub.Channel.NOTIFICATIONS, event.recipientUserId(), "unread-count",
                Map.of("count", unread));
    }

    public static DiffusionLiveEvent toEvent(DiffusionLog log) {
        return DiffusionLiveEvent.builder()
                .diffusionLogId(log.getId())
                .supportId(log.getSupport() == null ? null : log.getSupport().getId())
                .supportName(log.getSupport() == null ? null : log.getSupport().getName())
                .zoneName(log.getZone() == null ? null : log.getZone().getName())
                .contentType(log.getContentType() == null ? null : log.getContentType().name())
                .campaignId(log.getCampaign() == null ? null : log.getCampaign().getId())
                .campaignName(log.getCampaign() == null ? null : log.getCampaign().getName())
                .emergencyId(log.getEmergency() == null ? null : log.getEmergency().getId())
                .title(log.getTitle())
                .diffusedAt(log.getDiffusedAt())
                .build();
    }
}
