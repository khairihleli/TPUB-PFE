package com.example.zelqanepfe.service.realtime;

import com.example.zelqanepfe.dto.NotificationResponse;

/** One notification to push to its recipient (docs/round2-contract.md §5.5). */
public record NotificationPushEvent(Long recipientUserId, String recipientEmail,
                                    NotificationResponse notification) {
}
