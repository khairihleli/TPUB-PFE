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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * A click or interaction reported by a player on one diffusion (at most one per type).
 */
@Entity
@Table(name = "diffusion_interactions", uniqueConstraints = @UniqueConstraint(
        name = "uq_diffusion_interactions_log_type", columnNames = {"diffusion_log_id", "interaction_type"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionInteraction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "diffusion_log_id", nullable = false)
    private DiffusionLog diffusionLog;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id")
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "support_id", nullable = false)
    private DiffusionSupport support;

    @Enumerated(EnumType.STRING)
    @Column(name = "interaction_type", nullable = false, length = 20)
    private InteractionType interactionType;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
