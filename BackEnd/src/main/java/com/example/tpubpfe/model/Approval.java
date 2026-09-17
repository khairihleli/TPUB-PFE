package com.example.tpubpfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** One administrator's decision in a multi-level approval cycle (docs/round2-contract.md §5.4, V9). */
@Entity
@Table(name = "approvals", uniqueConstraints = @UniqueConstraint(name = "uq_approvals_approver",
        columnNames = {"entity_type", "entity_id", "cycle_key", "approver_user_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Approval {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "entity_type", nullable = false, length = 12)
    private ApprovalEntityType entityType;

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    /** {@code "check:<id>"} for campaigns, {@code "emergency"} for emergency messages. */
    @Column(name = "cycle_key", nullable = false, length = 40)
    private String cycleKey;

    @Column(name = "approver_user_id", nullable = false)
    private Long approverUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ApprovalDecision decision;

    @Column(length = 1000)
    private String comment;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> details;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
