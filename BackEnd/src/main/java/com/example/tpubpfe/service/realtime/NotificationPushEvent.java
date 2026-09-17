package com.example.tpubpfe.service.realtime;

import com.example.tpubpfe.dto.NotificationResponse;

/** One notification to push to its recipient (docs/round2-contract.md §5.5). */
public record NotificationPushEvent(Long recipientUserId, String recipientEmail,
                                    NotificationResponse notification) {
}
