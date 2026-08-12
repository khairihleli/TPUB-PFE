package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.SupportAvailability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface SupportAvailabilityRepository extends JpaRepository<SupportAvailability, Long> {

    List<SupportAvailability> findBySupportId(Long supportId);

    List<SupportAvailability> findBySupportIdAndAvailabilityDate(Long supportId, LocalDate date);
}
