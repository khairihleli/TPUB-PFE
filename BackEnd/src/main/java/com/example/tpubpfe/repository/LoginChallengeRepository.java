package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.LoginChallenge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface LoginChallengeRepository extends JpaRepository<LoginChallenge, String> {

    Optional<LoginChallenge> findByTokenHash(String tokenHash);

    @Modifying
    @Query("DELETE FROM LoginChallenge c WHERE c.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
