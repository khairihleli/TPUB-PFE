package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.CampaignZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CampaignZoneRepository extends JpaRepository<CampaignZone, Long> {

    List<CampaignZone> findByCampaignId(Long campaignId);

    List<CampaignZone> findByCampaignIdOrderByIdAsc(Long campaignId);

    List<CampaignZone> findByZoneId(Long zoneId);

    long countByCampaignId(Long campaignId);
}
