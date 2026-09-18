package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.CampaignStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;

import java.util.List;

public interface CampaignZoneRepository extends JpaRepository<CampaignZone, Long> {

    List<CampaignZone> findByCampaignId(Long campaignId);

    List<CampaignZone> findByCampaignIdOrderByIdAsc(Long campaignId);

    List<CampaignZone> findByZoneId(Long zoneId);

    long countByCampaignId(Long campaignId);

    /** Heatmap targets (round 2 §4.5): zones of campaigns not in {@code excluded} whose period overlaps [from, to]. */
    @Query("""
            SELECT z FROM CampaignZone z
            JOIN FETCH z.campaign c
            WHERE c.status <> :excluded
              AND c.startDate <= :to
              AND c.endDate >= :from
            ORDER BY z.id ASC
            """)
    List<CampaignZone> findTargetsOverlapping(@Param("excluded") CampaignStatus excluded, @Param("from") LocalDate from,
                                              @Param("to") LocalDate to);
}
