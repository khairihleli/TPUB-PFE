package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Presence change of one player (docs/round2-contract.md §5.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceEvent {

    private Long supportId;
    /** EN_LIGNE or HORS_LIGNE. */
    private String presence;
    private Instant lastHeartbeatAt;
    private Instant changedAt;
}
