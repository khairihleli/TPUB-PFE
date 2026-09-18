package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.AiDecisionLog;
import com.example.zelqanepfe.model.AiDecisionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AiDecisionLogRepository extends JpaRepository<AiDecisionLog, Long>, JpaSpecificationExecutor<AiDecisionLog> {

    List<AiDecisionLog> findByCampaignId(Long campaignId);

    List<AiDecisionLog> findByDecisionType(AiDecisionType decisionType);

    /** Effective administrator decisions that have no {@code ai_feedback} row yet (docs/round2-contract.md §2.6). */
    @Query("""
            select l from AiDecisionLog l
            join fetch l.check c
            join fetch l.campaign
            left join fetch l.decidedByUser
            where l.decisionType = com.example.zelqanepfe.model.AiDecisionType.ADMIN
              and l.decision in ('VALIDATED', 'VALIDATED_OVERRIDE', 'REJECTED')
              and not exists (select f.id from AiFeedback f where f.decisionLog = l)
            order by l.createdAt asc, l.id asc
            """)
    List<AiDecisionLog> findAdminDecisionsWithoutFeedback();
}
