package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogResponse {

    private Long id;
    private Long actorUserId;
    private String actorEmail;
    private String actorName;
    private String actorRole;
    private String action;
    private String entityType;
    private String entityId;
    private String summary;
    private Map<String, Object> details;
    private String ipAddress;
    private Instant createdAt;
}
