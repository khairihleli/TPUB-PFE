package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiContentCheckRepository extends JpaRepository<AiContentCheck, Long> {

    List<AiContentCheck> findByCampaignId(Long campaignId);

    Optional<AiContentCheck> findTopByCampaignIdOrderByCheckedAtDesc(Long campaignId);

    /** Latest check, preview or not. */
    Optional<AiContentCheck> findTopByCampaignIdOrderByCheckedAtDescIdDesc(Long campaignId);

    /** Latest check that was applied to the campaign (not a draft pre-analysis). */
    Optional<AiContentCheck> findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(Long campaignId);

    List<AiContentCheck> findByCampaignIdOrderByCheckedAtDescIdDesc(Long campaignId);

    List<AiContentCheck> findByIsPreviewFalse();

    List<AiContentCheck> findByAiStatus(AiCheckStatus aiStatus);
}
