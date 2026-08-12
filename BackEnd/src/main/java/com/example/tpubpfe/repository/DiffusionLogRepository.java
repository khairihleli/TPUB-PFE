package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.DiffusionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DiffusionLogRepository extends JpaRepository<DiffusionLog, Long> {

    List<DiffusionLog> findByCampaignId(Long campaignId);

    List<DiffusionLog> findBySupportId(Long supportId);
}
