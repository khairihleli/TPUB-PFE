package com.example.zelqanepfe.model;

import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.TechnicalStatus;
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

@Entity
@Table(name = "diffusion_supports")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionSupport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;

    @Column(nullable = false, length = 150)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "support_type", nullable = false, length = 30)
    private SupportType supportType;

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal longitude;

    @Enumerated(EnumType.STRING)
    @Column(name = "technical_status", nullable = false, length = 20)
    @Builder.Default
    private TechnicalStatus technicalStatus = TechnicalStatus.ACTIF;

    @Column(name = "diffusion_capacity", nullable = false)
    @Builder.Default
    private Short diffusionCapacity = 1;

    @Column(name = "visibility_score", precision = 5, scale = 2)
    private BigDecimal visibilityScore;

    // Explicit VARCHAR: Hibernate maps a length-1 enum to CHAR(1) by default, the column is VARCHAR(1).
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "porteur_type", length = 1)
    private PorteurType porteurType;

    @Column(name = "mast_height_m")
    private Short mastHeightM;

    @Column(name = "heading_deg")
    private Short headingDeg;

    @Column(length = 255)
    private String address;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
