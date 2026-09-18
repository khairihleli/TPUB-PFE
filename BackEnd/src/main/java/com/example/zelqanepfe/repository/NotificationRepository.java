package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByRecipientUserId(Long recipientUserId, Pageable pageable);

    Page<Notification> findByRecipientUserIdAndReadAtIsNull(Long recipientUserId, Pageable pageable);

    long countByRecipientUserIdAndReadAtIsNull(Long recipientUserId);

    Optional<Notification> findByIdAndRecipientUserId(Long id, Long recipientUserId);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now WHERE n.recipientUserId = :userId AND n.readAt IS NULL")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.readAt IS NOT NULL AND n.createdAt < :threshold")
    int deleteReadOlderThan(@Param("threshold") Instant threshold);
}
