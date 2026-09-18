package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.Approval;
import com.example.zelqanepfe.model.ApprovalDecision;
import com.example.zelqanepfe.model.ApprovalEntityType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ApprovalRepository extends JpaRepository<Approval, Long> {

    /** Rows of one approval cycle, oldest first. */
    List<Approval> findByEntityTypeAndEntityIdAndCycleKeyOrderByCreatedAtAscIdAsc(ApprovalEntityType entityType,
                                                                                 Long entityId, String cycleKey);

    List<Approval> findByEntityTypeAndEntityIdOrderByCreatedAtAscIdAsc(ApprovalEntityType entityType, Long entityId);

    List<Approval> findByEntityTypeAndEntityIdInOrderByCreatedAtAscIdAsc(ApprovalEntityType entityType,
                                                                        Collection<Long> entityIds);

    /** Distinct entity ids that received at least one approval of that type, newest first. */
    @Query("""
            SELECT a.entityId FROM Approval a
            WHERE a.entityType = :entityType AND a.decision = :decision
            GROUP BY a.entityId
            ORDER BY MAX(a.createdAt) DESC
            """)
    List<Long> findEntityIds(@Param("entityType") ApprovalEntityType entityType,
                             @Param("decision") ApprovalDecision decision);

    boolean existsByEntityTypeAndEntityIdAndCycleKeyAndApproverUserIdAndDecision(ApprovalEntityType entityType,
                                                                                 Long entityId, String cycleKey,
                                                                                 Long approverUserId,
                                                                                 ApprovalDecision decision);
}
