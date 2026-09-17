package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.SupportAvailability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface SupportAvailabilityRepository extends JpaRepository<SupportAvailability, Long> {

    List<SupportAvailability> findBySupportId(Long supportId);

    List<SupportAvailability> findBySupportIdAndAvailabilityDate(Long supportId, LocalDate date);

    List<SupportAvailability> findBySupportIdAndAvailabilityDateBetweenOrderByAvailabilityDateAscStartTimeAsc(
            Long supportId, LocalDate from, LocalDate to);

    List<SupportAvailability> findByAvailabilityDateBetween(LocalDate from, LocalDate to);

    Optional<SupportAvailability> findByIdAndSupportId(Long id, Long supportId);
}
