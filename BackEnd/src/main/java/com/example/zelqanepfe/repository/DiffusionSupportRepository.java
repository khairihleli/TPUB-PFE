package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.TechnicalStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface DiffusionSupportRepository extends JpaRepository<DiffusionSupport, Long> {

    List<DiffusionSupport> findByZoneId(Long zoneId);

    List<DiffusionSupport> findByZoneIdAndTechnicalStatus(Long zoneId, TechnicalStatus status);

    List<DiffusionSupport> findBySupportType(SupportType supportType);

    long countByZoneId(Long zoneId);

    /**
     * Loads the supports with a row lock held until the end of the transaction, in id order (no deadlock between
     * two batches). Serialises concurrent bookings of the same Porteur so the capacity check cannot be raced.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from DiffusionSupport s where s.id in :ids order by s.id")
    List<DiffusionSupport> findAllByIdForUpdate(@Param("ids") Collection<Long> ids);
}
