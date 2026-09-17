package com.example.tpubpfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Supervision alert (docs/round2-contract.md §5.3, V9). References are plain ids: the foreign keys and their
 * cascades live in the migration.
 */
@Entity
@Table(name = "supervision_alerts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupervisionAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "alert_type", nullable = false, length = 30)
    private SupervisionAlertType alertType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private AlertSeverity severity;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 1000)
    private String message;

    @Column(name = "support_id")
    private Long supportId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "emergency_id")
    private Long emergencyId;

    @Column(name = "campaign_id")
    private Long campaignId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    @Column(name = "acknowledged_by_user_id")
    private Long acknowledgedByUserId;
}
