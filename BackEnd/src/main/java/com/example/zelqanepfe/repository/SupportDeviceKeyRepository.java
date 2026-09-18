package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.SupportDeviceKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupportDeviceKeyRepository extends JpaRepository<SupportDeviceKey, Long> {

    /** The active key of a support (at most one). */
    Optional<SupportDeviceKey> findFirstBySupportIdAndRevokedAtIsNullOrderByIdDesc(Long supportId);

    List<SupportDeviceKey> findBySupportIdAndRevokedAtIsNull(Long supportId);

    List<SupportDeviceKey> findByRevokedAtIsNull();
}
