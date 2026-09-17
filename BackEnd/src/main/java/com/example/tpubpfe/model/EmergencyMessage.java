package com.example.tpubpfe.model;

import com.example.tpubpfe.model.UrgencyLevel;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Map;

@Entity
@Table(name = "emergency_messages")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmergencyMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(name = "radius_km", precision = 8, scale = 3)
    private BigDecimal radiusKm;

    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "target_polygon", columnDefinition = "jsonb") private Map<String, Object> targetPolygon;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "duration_seconds")
    private Short durationSeconds;

    @Column(nullable = false)
    @Builder.Default
    private Short priority = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "urgency_level", nullable = false, length = 20)
    @Builder.Default
    private UrgencyLevel urgencyLevel = UrgencyLevel.HIGH;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "stopped_at")
    private Instant stoppedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "stop_reason", length = 20)
    private EmergencyStopReason stopReason;

    /** Multi-level approval (docs/round2-contract.md §5.4): only APPROUVE messages are broadcast. */
    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status", nullable = false, length = 12)
    @Builder.Default
    private EmergencyApprovalStatus approvalStatus = EmergencyApprovalStatus.APPROUVE;

    @Column(name = "approvals_required", nullable = false)
    @Builder.Default
    private Short approvalsRequired = 1;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
