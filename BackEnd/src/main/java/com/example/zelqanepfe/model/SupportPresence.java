package com.example.zelqanepfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Last known presence of a player (docs/round2-contract.md §5.2, V9 {@code support_presence}). */
@Entity
@Table(name = "support_presence")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportPresence {

    @Id
    @Column(name = "support_id")
    private Long supportId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PresenceState state;

    @Column(name = "last_heartbeat_at", nullable = false)
    private Instant lastHeartbeatAt;

    @Column(name = "state_changed_at", nullable = false)
    private Instant stateChangedAt;

    @Column(name = "last_ip", length = 64)
    private String lastIp;

    @Column(name = "player_version", length = 40)
    private String playerVersion;

    @Column(name = "current_diffusion_log_id")
    private Long currentDiffusionLogId;
}
