package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.DiffusionInteraction;
import com.example.tpubpfe.model.InteractionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface DiffusionInteractionRepository extends JpaRepository<DiffusionInteraction, Long> {

    boolean existsByDiffusionLogIdAndInteractionType(Long diffusionLogId, InteractionType interactionType);

    long countByInteractionType(InteractionType interactionType);

    /** Rows of [diffusionLogId, interactionType, count] for the given logs. */
    @Query("""
            SELECT i.diffusionLog.id, i.interactionType, COUNT(i) FROM DiffusionInteraction i
            WHERE i.diffusionLog.id IN :logIds
            GROUP BY i.diffusionLog.id, i.interactionType
            """)
    List<Object[]> countByLogIds(@Param("logIds") Collection<Long> logIds);

    /** Interactions attributed to the diffusion time: the log's diffusedAt is in [from, to). */
    @Query("""
            SELECT i FROM DiffusionInteraction i
            JOIN FETCH i.diffusionLog l
            WHERE l.diffusedAt >= :from
              AND l.diffusedAt < :to
            """)
    List<DiffusionInteraction> findByLogDiffusedBetween(@Param("from") Instant from, @Param("to") Instant to);
}
