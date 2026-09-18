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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * A targeting zone of a campaign: a circle (point + radius) or a polygon (docs/round2-contract.md §4.3). For a
 * polygon, {@code latitude/longitude} hold its centroid and {@code radiusKm} its circumscribed radius, so readers that
 * only know circles stay safe. {@code zone} is the ZELQANE zone the centre was resolved to.
 */
@Entity
@Table(name = "campaign_zones")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "zone_id", nullable = false)
    private Zone zone;

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(name = "radius_km", nullable = false, precision = 8, scale = 3)
    private BigDecimal radiusKm;

    @Column(length = 150)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "geometry_type", nullable = false, length = 10)
    @Builder.Default
    private ZoneGeometryType geometryType = ZoneGeometryType.CERCLE;

    /** Normalised GeoJSON Polygon / MultiPolygon, null for a circle. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> polygon;

    @Column(name = "area_km2", precision = 10, scale = 3)
    private BigDecimal areaKm2;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
