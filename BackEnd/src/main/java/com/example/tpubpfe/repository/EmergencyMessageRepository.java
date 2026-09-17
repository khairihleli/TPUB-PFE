package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.EmergencyMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface EmergencyMessageRepository extends JpaRepository<EmergencyMessage, Long> {

    List<EmergencyMessage> findByZoneId(Long zoneId);

    List<EmergencyMessage> findByIsActiveTrue();

    List<EmergencyMessage> findAllByOrderByCreatedAtDescIdDesc();

    /** Messages waiting for a multi-level approval, newest first (docs/round2-contract.md §5.4). */
    List<EmergencyMessage> findByApprovalStatusAndIsActiveTrueOrderByCreatedAtDescIdDesc(
            com.example.tpubpfe.model.EmergencyApprovalStatus approvalStatus);

    long countByZoneId(Long zoneId);

    @Query("""
            SELECT e FROM EmergencyMessage e
            WHERE e.isActive = true
              AND e.zone.id = :zoneId
              AND e.startDate <= :date
              AND e.endDate >= :date
            ORDER BY e.priority ASC
            """)
    List<EmergencyMessage> findActiveForZoneOnDate(
            @Param("zoneId") Long zoneId,
            @Param("date") LocalDate date
    );

    /**
     * Active, approved messages whose date range covers {@code date}, any zone (time window and target filtered in
     * Java). Messages pending a multi-level approval are never broadcast (docs/round2-contract.md §5.4).
     */
    @Query("""
            SELECT e FROM EmergencyMessage e
            JOIN FETCH e.zone z
            WHERE e.isActive = true
              AND e.approvalStatus = com.example.tpubpfe.model.EmergencyApprovalStatus.APPROUVE
              AND e.startDate <= :date
              AND e.endDate >= :date
            """)
    List<EmergencyMessage> findActiveOnDate(@Param("date") LocalDate date);
}
