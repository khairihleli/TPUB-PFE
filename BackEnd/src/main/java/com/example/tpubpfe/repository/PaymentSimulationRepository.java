package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.PaymentSimulation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentSimulationRepository extends JpaRepository<PaymentSimulation, Long> {

    List<PaymentSimulation> findByCampaignId(Long campaignId);

    List<PaymentSimulation> findByClientId(Long clientId);
}
