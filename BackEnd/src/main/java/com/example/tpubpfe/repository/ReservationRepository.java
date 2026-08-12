package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    List<Reservation> findByCampaignId(Long campaignId);

    List<Reservation> findBySupportId(Long supportId);

    List<Reservation> findByReservationStatus(ReservationStatus status);

    @Query("""
            SELECT r FROM Reservation r
            WHERE r.support.id = :supportId
              AND r.reservationStatus IN :statuses
              AND r.startDate <= :endDate
              AND r.endDate >= :startDate
            """)
    List<Reservation> findConflictingReservations(
            @Param("supportId") Long supportId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("statuses") List<ReservationStatus> statuses
    );

    @Query("""
            SELECT r FROM Reservation r
            WHERE r.support.id = :supportId
              AND r.reservationStatus = :status
              AND r.startDate <= :date
              AND r.endDate >= :date
              AND r.startTime <= :time
              AND r.endTime > :time
            """)
    List<Reservation> findActiveReservationsForSupportAt(
            @Param("supportId") Long supportId,
            @Param("date") LocalDate date,
            @Param("time") LocalTime time,
            @Param("status") ReservationStatus status
    );
}
