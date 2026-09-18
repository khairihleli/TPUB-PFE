package com.example.zelqanepfe.model;

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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** One administrator decision compared with the AI verdict (docs/round2-contract.md §2.6). */
@Entity
@Table(name = "ai_feedback")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "decision_log_id", nullable = false, unique = true)
    private AiDecisionLog decisionLog;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "check_id")
    private AiContentCheck check;

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_status", nullable = false, length = 20)
    private AiCheckStatus aiStatus;

    /** VALIDATED, VALIDATED_OVERRIDE or REJECTED. */
    @Column(name = "admin_decision", nullable = false, length = 20)
    private String adminDecision;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AiFeedbackOutcome outcome;

    @Column(name = "risk_score", nullable = false)
    private Short riskScore;

    @Column(name = "quality_score", nullable = false)
    private Short qualityScore;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "matched_rule_ids", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Long> matchedRuleIds = new ArrayList<>();

    @Column(name = "calibration_version")
    private Integer calibrationVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by_user_id")
    private User decidedByUser;

    /** Copied from the decision log. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
