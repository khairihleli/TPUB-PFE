package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;

public interface CampaignRepository extends JpaRepository<Campaign, Long>, JpaSpecificationExecutor<Campaign> {

    List<Campaign> findByClientId(Long clientId);

    List<Campaign> findByStatus(CampaignStatus status);

    List<Campaign> findByStatusIn(Collection<CampaignStatus> statuses);

    List<Campaign> findByNameContainingIgnoreCase(String name);
}
