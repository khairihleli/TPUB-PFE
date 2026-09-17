package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface AiDecisionLogRepository extends JpaRepository<AiDecisionLog, Long>, JpaSpecificationExecutor<AiDecisionLog> {

    List<AiDecisionLog> findByCampaignId(Long campaignId);

    List<AiDecisionLog> findByDecisionType(AiDecisionType decisionType);
}
