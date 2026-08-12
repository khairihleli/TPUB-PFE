package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DiffusionSupportRepository extends JpaRepository<DiffusionSupport, Long> {

    List<DiffusionSupport> findByZoneId(Long zoneId);

    List<DiffusionSupport> findByZoneIdAndTechnicalStatus(Long zoneId, TechnicalStatus status);

    List<DiffusionSupport> findBySupportType(SupportType supportType);
}
