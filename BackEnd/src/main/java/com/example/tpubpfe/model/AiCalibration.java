package com.example.tpubpfe.model;

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
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Versioned AI calibration: review/reject thresholds and learnt per-rule weights (docs/round2-contract.md §2.6).
 * At most one version is active; PostgreSQL enforces it with a partial unique index, the service does on H2.
 */
@Entity
@Table(name = "ai_calibrations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiCalibration {

    /** Origine d'une version de calibration. */
    public enum Trigger {
        INITIAL,
        PLANIFIE,
        MANUEL
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Integer version;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_type", nullable = false, length = 10)
    private Trigger triggerType;

    @Column(nullable = false)
    @Builder.Default
    private Boolean changed = false;

    /** Review from risk ≥ this value. */
    @Column(name = "approve_threshold", nullable = false)
    private Short approveThreshold;

    /** Reject when risk > this value. */
    @Column(name = "reject_threshold", nullable = false)
    private Short rejectThreshold;

    /** Rule id (as a string key) → weight 0.5..1.5; absent = 1.0. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rule_weights", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Double> ruleWeights = new LinkedHashMap<>();

    @Column(name = "feedback_count", nullable = false)
    @Builder.Default
    private Integer feedbackCount = 0;

    @Column(name = "false_positive_count", nullable = false)
    @Builder.Default
    private Integer falsePositiveCount = 0;

    @Column(name = "false_negative_count", nullable = false)
    @Builder.Default
    private Integer falseNegativeCount = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metrics = new LinkedHashMap<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
