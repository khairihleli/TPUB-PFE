package com.example.zelqanepfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Player device key of a Porteur (V7 {@code support_device_keys}). At most one row per support has
 * {@code revoked_at IS NULL} (partial unique index in SQL, enforced by {@code DeviceKeyService} on H2).
 */
@Entity
@Table(name = "support_device_keys")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportDeviceKey {

    public enum RevokeReason {
        ROTATED,
        REVOKED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "support_id", nullable = false)
    private Long supportId;

    /** SHA-256 hex of the full key. */
    @Column(name = "key_hash", nullable = false, unique = true, length = 64)
    private String keyHash;

    @Column(name = "key_prefix", nullable = false, length = 12)
    private String keyPrefix;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "last_used_ip", length = 64)
    private String lastUsedIp;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "revoked_by_user_id")
    private Long revokedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoke_reason", length = 10)
    private RevokeReason revokeReason;
}
