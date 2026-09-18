package com.example.zelqanepfe.model;

import com.example.zelqanepfe.model.DiffusionContentType;
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

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "diffusion_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "support_id", nullable = false)
    private DiffusionSupport support;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id")
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emergency_id")
    private EmergencyMessage emergency;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reservation_id")
    private Reservation reservation;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_type", nullable = false, length = 30)
    @Builder.Default
    private DiffusionContentType contentType = DiffusionContentType.PUBLICITE;

    @Column(length = 255)
    private String title;

    @Column(name = "media_url", length = 500)
    private String mediaUrl;

    @Column(name = "duration_seconds")
    private Short durationSeconds;

    @Column(nullable = false)
    @Builder.Default
    private Short priority = 0;

    /** Simulated cost of this diffusion (unit cost for PUBLICITE, 0 otherwise). */
    @Column(nullable = false, precision = 10, scale = 4)
    @Builder.Default
    private BigDecimal cost = BigDecimal.ZERO;

    @Column(name = "diffused_at", nullable = false)
    @Builder.Default
    private Instant diffusedAt = Instant.now();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
