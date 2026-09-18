package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, String> {

    @Query("SELECT s FROM UserSession s JOIN FETCH s.user u JOIN FETCH u.role WHERE s.id = :id")
    Optional<UserSession> findWithUserById(@Param("id") String id);

    @Query("""
            SELECT s FROM UserSession s
            WHERE s.user.id = :userId AND s.revokedAt IS NULL AND s.expiresAt > :now
            ORDER BY s.lastSeenAt DESC, s.createdAt DESC
            """)
    List<UserSession> findActiveByUserId(@Param("userId") Long userId, @Param("now") Instant now);

    @Query("""
            SELECT COUNT(s) FROM UserSession s
            WHERE s.user.id = :userId AND s.revokedAt IS NULL AND s.expiresAt > :now
            """)
    long countActiveByUserId(@Param("userId") Long userId, @Param("now") Instant now);

    /** Rows of [userId, activeSessionCount]. */
    @Query("""
            SELECT s.user.id, COUNT(s) FROM UserSession s
            WHERE s.user.id IN :userIds AND s.revokedAt IS NULL AND s.expiresAt > :now
            GROUP BY s.user.id
            """)
    List<Object[]> countActiveByUserIds(@Param("userIds") Collection<Long> userIds, @Param("now") Instant now);
}
