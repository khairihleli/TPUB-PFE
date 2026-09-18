package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Answer of a player heartbeat (docs/round2-contract.md §5.2). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeartbeatResponse {

    private Long supportId;
    /** Always EN_LIGNE: a heartbeat that reached the server means the screen is online. */
    private String state;
    private Instant serverTime;
    private int nextHeartbeatSeconds;
}
