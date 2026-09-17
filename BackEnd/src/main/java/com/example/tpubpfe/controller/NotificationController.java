package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.NotificationResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.ReadAllResponse;
import com.example.tpubpfe.dto.UnreadCountResponse;
import com.example.tpubpfe.service.notification.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Notification centre of the staff (docs/round2-contract.md §5.5). */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @Operation(summary = "Notifications of the current user, newest first")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<PageResponse<NotificationResponse>> list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(notificationService.list(unreadOnly, page, size));
    }

    @Operation(summary = "Number of unread notifications")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping("/unread-count")
    public ResponseEntity<UnreadCountResponse> unreadCount() {
        return ResponseEntity.ok(UnreadCountResponse.builder().count(notificationService.unreadCount()).build());
    }

    @Operation(summary = "Marks one notification as read")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable Long id) {
        notificationService.markRead(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Marks every notification of the current user as read")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @PostMapping("/read-all")
    public ResponseEntity<ReadAllResponse> markAllRead() {
        return ResponseEntity.ok(ReadAllResponse.builder().updated(notificationService.markAllRead()).build());
    }
}
