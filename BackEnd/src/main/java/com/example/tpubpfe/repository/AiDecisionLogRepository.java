package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiDecisionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiDecisionLogRepository extends JpaRepository<AiDecisionLog, Long> {

    List<AiDecisionLog> findByCampaignId(Long campaignId);
}
