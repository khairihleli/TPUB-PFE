package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long>, JpaSpecificationExecutor<Reservation> {

    List<Reservation> findByCampaignId(Long campaignId);

    List<Reservation> findBySupportId(Long supportId);

    List<Reservation> findByReservationStatus(ReservationStatus status);

    long countByZoneId(Long zoneId);

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
              AND r.reservationStatus IN :statuses
              AND r.startDate <= :to
              AND r.endDate >= :from
            ORDER BY r.startDate ASC, r.endDate ASC, r.startTime ASC
            """)
    List<Reservation> findBookedPeriodsForSupport(
            @Param("supportId") Long supportId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
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
            ORDER BY r.id ASC
            """)
    List<Reservation> findActiveReservationsForSupportAt(
            @Param("supportId") Long supportId,
            @Param("date") LocalDate date,
            @Param("time") LocalTime time,
            @Param("status") ReservationStatus status
    );

    /** Every reservation in one of {@code statuses} whose dates intersect [from, to], all supports. */
    @Query("""
            SELECT r FROM Reservation r
            JOIN FETCH r.support s
            JOIN FETCH r.campaign c
            WHERE r.reservationStatus IN :statuses
              AND r.startDate <= :to
              AND r.endDate >= :from
            ORDER BY r.id ASC
            """)
    List<Reservation> findByStatusesOverlappingDates(
            @Param("statuses") Collection<ReservationStatus> statuses,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to
    );

    @Query("""
            SELECT r FROM Reservation r
            JOIN FETCH r.campaign c
            WHERE c.client.id = :clientId
            ORDER BY r.createdAt DESC, r.id DESC
            """)
    List<Reservation> findByClientId(@Param("clientId") Long clientId);
}
