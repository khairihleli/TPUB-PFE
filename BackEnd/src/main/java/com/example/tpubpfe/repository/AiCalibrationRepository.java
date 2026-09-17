package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiCalibration;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AiCalibrationRepository extends JpaRepository<AiCalibration, Long> {

    Optional<AiCalibration> findFirstByIsActiveTrueOrderByVersionDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from AiCalibration c where c.isActive = true order by c.version desc")
    List<AiCalibration> lockActive();

    List<AiCalibration> findByIsActiveTrue();

    Optional<AiCalibration> findByVersion(Integer version);

    List<AiCalibration> findTop50ByOrderByVersionDesc();

    @Query("select coalesce(max(c.version), 0) from AiCalibration c")
    int maxVersion();
}
