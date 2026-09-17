package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface DiffusionLogRepository extends JpaRepository<DiffusionLog, Long>, JpaSpecificationExecutor<DiffusionLog> {

    List<DiffusionLog> findByCampaignId(Long campaignId);

    List<DiffusionLog> findBySupportId(Long supportId);

    long countByContentType(DiffusionContentType contentType);

    long countByContentTypeAndDiffusedAtGreaterThanEqualAndDiffusedAtLessThan(
            DiffusionContentType contentType, Instant from, Instant to);

    long countByEmergencyId(Long emergencyId);

    long countByZoneId(Long zoneId);

    /** Frequency cap: PUBLICITE diffusions of a campaign on a support with diffusedAt in (from, to]. */
    @Query("""
            SELECT COUNT(l) FROM DiffusionLog l
            WHERE l.contentType = :type
              AND l.campaign.id = :campaignId
              AND l.support.id = :supportId
              AND l.diffusedAt > :from
              AND l.diffusedAt <= :to
            """)
    long countInWindow(@Param("type") DiffusionContentType type, @Param("campaignId") Long campaignId,
                       @Param("supportId") Long supportId, @Param("from") Instant from, @Param("to") Instant to);

    /** Latest diffusedAt of a campaign on a support for a content type (null when never diffused). */
    @Query("""
            SELECT MAX(l.diffusedAt) FROM DiffusionLog l
            WHERE l.contentType = :type
              AND l.campaign.id = :campaignId
              AND l.support.id = :supportId
            """)
    Instant findLastDiffusion(@Param("type") DiffusionContentType type, @Param("campaignId") Long campaignId,
                              @Param("supportId") Long supportId);

    @Query("""
            SELECT MAX(l.diffusedAt) FROM DiffusionLog l
            WHERE l.contentType = :type
              AND l.campaign.id = :campaignId
            """)
    Instant findLastDiffusionOfCampaign(@Param("type") DiffusionContentType type, @Param("campaignId") Long campaignId);

    @Query("""
            SELECT l FROM DiffusionLog l
            JOIN FETCH l.support s
            LEFT JOIN FETCH l.zone z
            LEFT JOIN FETCH l.campaign c
            WHERE l.contentType IN :types
              AND l.diffusedAt >= :from
              AND l.diffusedAt < :to
            """)
    List<DiffusionLog> findForStatistics(@Param("types") Collection<DiffusionContentType> types,
                                         @Param("from") Instant from, @Param("to") Instant to);

    /** Heatmap (round 2 §4.5): diffusions per support in [from, to): rows of [supportId, count]. */
    @Query("""
            SELECT l.support.id, COUNT(l) FROM DiffusionLog l
            WHERE l.contentType IN :types
              AND l.diffusedAt >= :from
              AND l.diffusedAt < :to
            GROUP BY l.support.id
            """)
    List<Object[]> countPerSupportBetween(@Param("types") Collection<DiffusionContentType> types,
                                          @Param("from") Instant from, @Param("to") Instant to);

    /** PUBLICITE diffusions per support since {@code from}: rows of [supportId, count]. */
    @Query("""
            SELECT l.support.id, COUNT(l) FROM DiffusionLog l
            WHERE l.contentType = :type
              AND l.diffusedAt >= :from
            GROUP BY l.support.id
            """)
    List<Object[]> countPerSupportSince(@Param("type") DiffusionContentType type, @Param("from") Instant from);
}
