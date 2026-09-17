package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentSimulationRepository extends JpaRepository<PaymentSimulation, Long> {

    List<PaymentSimulation> findByCampaignId(Long campaignId);

    List<PaymentSimulation> findByClientId(Long clientId);

    Optional<PaymentSimulation> findTopByCampaignIdOrderByCreatedAtDescIdDesc(Long campaignId);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM PaymentSimulation p WHERE p.paymentStatus IN :statuses")
    BigDecimal sumAmountByStatusIn(@Param("statuses") Collection<PaymentStatus> statuses);
}
