package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CampaignRepository extends JpaRepository<Campaign, Long> {

    List<Campaign> findByClientId(Long clientId);

    List<Campaign> findByStatus(CampaignStatus status);

    List<Campaign> findByNameContainingIgnoreCase(String name);
}
