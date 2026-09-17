package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One in-app notification (docs/round2-contract.md §5.5). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationResponse {

    private Long id;
    private String type;
    /** INFO, AVERTISSEMENT, CRITIQUE. */
    private String severity;
    private String title;
    private String message;
    private String link;
    private String entityType;
    private String entityId;
    private Instant createdAt;
    private Instant readAt;
}
