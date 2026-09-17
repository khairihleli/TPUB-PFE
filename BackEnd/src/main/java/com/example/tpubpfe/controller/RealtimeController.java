package com.example.tpubpfe.controller;

import com.example.tpubpfe.service.SecurityUtils;
import com.example.tpubpfe.service.notification.NotificationService;
import com.example.tpubpfe.service.realtime.SseHub;
import com.example.tpubpfe.service.supervision.SupervisionService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * Server-Sent Events streams (docs/round2-contract.md §5.3). The first event carries the full state, so a
 * reconnection never needs {@code Last-Event-ID}.
 */
@RestController
@RequestMapping("/api/realtime")
@RequiredArgsConstructor
public class RealtimeController {

    private final SseHub hub;
    private final SupervisionService supervisionService;
    private final NotificationService notificationService;

    @Operation(summary = "Live supervision stream (snapshot, diffusion, presence, emergency, alert, stats)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping(value = "/supervision", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter supervision() {
        SseEmitter emitter = hub.open(SseHub.Channel.SUPERVISION, SecurityUtils.getCurrentUser().getId());
        hub.sendTo(emitter, "snapshot", supervisionService.snapshot());
        return emitter;
    }

    @Operation(summary = "Live notification stream of the current user")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping(value = "/notifications", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter notifications() {
        SseEmitter emitter = hub.open(SseHub.Channel.NOTIFICATIONS, SecurityUtils.getCurrentUser().getId());
        hub.sendTo(emitter, "unread-count", Map.of("count", notificationService.unreadCount()));
        return emitter;
    }
}
