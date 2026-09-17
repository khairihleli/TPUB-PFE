package com.example.tpubpfe.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Optional body of the player heartbeat (docs/round2-contract.md §5.2). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeartbeatRequest {

    @Size(max = 40)
    private String playerVersion;
    private Long currentDiffusionLogId;
    private Boolean visible;
}
