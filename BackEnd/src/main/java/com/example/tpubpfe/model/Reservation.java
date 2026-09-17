package com.example.tpubpfe.model;

import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.dto.PriceBreakdown;
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

@Entity
@Table(name = "reservations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "support_id", nullable = false)
    private DiffusionSupport support;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "availability_status", nullable = false, length = 20)
    @Builder.Default
    private AvailabilityStatus availabilityStatus = AvailabilityStatus.DISPONIBLE;

    @Enumerated(EnumType.STRING)
    @Column(name = "reservation_status", nullable = false, length = 20)
    @Builder.Default
    private ReservationStatus reservationStatus = ReservationStatus.TEMPORAIRE;

    @Column(name = "estimated_views", nullable = false)
    @Builder.Default
    private Long estimatedViews = 0L;

    @Column(name = "estimated_cost", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal estimatedCost = BigDecimal.ZERO;

    /** Dynamic pricing multiplier frozen at booking time (docs/round2-contract.md §4.6); 1 before V8. */
    @Column(name = "price_multiplier", nullable = false, precision = 6, scale = 4)
    @Builder.Default
    private BigDecimal priceMultiplier = BigDecimal.ONE;

    /** R1 cost before the multiplier. */
    @Column(name = "base_cost", precision = 12, scale = 2)
    private BigDecimal baseCost;

    /** Breakdown computed at booking time; null for reservations created before V8. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "pricing_breakdown", columnDefinition = "jsonb")
    private PriceBreakdown pricingBreakdown;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancel_reason", length = 255)
    private String cancelReason;

    @Column(name = "cancelled_by_user_id")
    private Long cancelledByUserId;

    @Column(name = "expired_at")
    private Instant expiredAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
