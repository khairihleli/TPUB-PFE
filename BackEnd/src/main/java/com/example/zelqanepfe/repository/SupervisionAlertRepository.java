package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.SupervisionAlert;
import com.example.zelqanepfe.model.SupervisionAlertType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SupervisionAlertRepository extends JpaRepository<SupervisionAlert, Long>,
        JpaSpecificationExecutor<SupervisionAlert> {

    List<SupervisionAlert> findByAlertTypeAndSupportIdAndResolvedAtIsNull(SupervisionAlertType type, Long supportId);

    List<SupervisionAlert> findByAlertTypeAndZoneIdAndResolvedAtIsNull(SupervisionAlertType type, Long zoneId);

    List<SupervisionAlert> findByAlertTypeAndEmergencyIdAndResolvedAtIsNull(SupervisionAlertType type, Long emergencyId);

    List<SupervisionAlert> findByAlertTypeAndCampaignIdAndResolvedAtIsNull(SupervisionAlertType type, Long campaignId);

    List<SupervisionAlert> findByAlertTypeAndResolvedAtIsNull(SupervisionAlertType type);

    /** Open alerts, newest first (snapshot keeps the first 50). */
    List<SupervisionAlert> findTop50ByResolvedAtIsNullOrderByCreatedAtDescIdDesc();

    long countByResolvedAtIsNull();
}
