package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiCheckStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiContentCheckRepository extends JpaRepository<AiContentCheck, Long> {

    List<AiContentCheck> findByCampaignId(Long campaignId);

    Optional<AiContentCheck> findTopByCampaignIdOrderByCheckedAtDesc(Long campaignId);

    List<AiContentCheck> findByAiStatus(AiCheckStatus aiStatus);
}
