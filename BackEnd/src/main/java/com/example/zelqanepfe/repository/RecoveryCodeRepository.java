package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.RecoveryCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RecoveryCodeRepository extends JpaRepository<RecoveryCode, Long> {

    Optional<RecoveryCode> findByCodeHash(String codeHash);

    long countByUserIdAndUsedAtIsNull(Long userId);

    @Modifying
    @Query("DELETE FROM RecoveryCode c WHERE c.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
