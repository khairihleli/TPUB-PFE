package com.example.tpubpfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "statistics")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Statistic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stat_date", nullable = false)
    private LocalDate statDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id")
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "support_id")
    private DiffusionSupport support;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @Column(name = "total_campaigns", nullable = false)
    @Builder.Default
    private Integer totalCampaigns = 0;

    @Column(name = "active_campaigns", nullable = false)
    @Builder.Default
    private Integer activeCampaigns = 0;

    @Column(name = "pending_campaigns", nullable = false)
    @Builder.Default
    private Integer pendingCampaigns = 0;

    @Column(name = "ai_pending_campaigns", nullable = false)
    @Builder.Default
    private Integer aiPendingCampaigns = 0;

    @Column(name = "ai_rejected_campaigns", nullable = false)
    @Builder.Default
    private Integer aiRejectedCampaigns = 0;

    @Column(name = "available_supports", nullable = false)
    @Builder.Default
    private Integer availableSupports = 0;

    @Column(name = "confirmed_reservations", nullable = false)
    @Builder.Default
    private Integer confirmedReservations = 0;

    @Column(name = "views_count", nullable = false)
    @Builder.Default
    private Long viewsCount = 0L;

    @Column(name = "clicks_count", nullable = false)
    @Builder.Default
    private Long clicksCount = 0L;

    @Column(name = "interactions_count", nullable = false)
    @Builder.Default
    private Long interactionsCount = 0L;

    @Column(name = "estimated_budget", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal estimatedBudget = BigDecimal.ZERO;

    @Column(name = "consumed_budget", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal consumedBudget = BigDecimal.ZERO;

    @Column(name = "avg_risk_score", precision = 5, scale = 2)
    private BigDecimal avgRiskScore;

    @Column(name = "avg_quality_score", precision = 5, scale = 2)
    private BigDecimal avgQualityScore;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
