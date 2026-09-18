package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One line of the live diffusion feed (docs/round2-contract.md §5.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionLiveEvent {

    private Long diffusionLogId;
    private Long supportId;
    private String supportName;
    private String zoneName;
    /** PUBLICITE, URGENCE or DEFAUT. */
    private String contentType;
    private Long campaignId;
    private String campaignName;
    private Long emergencyId;
    private String title;
    private Instant diffusedAt;
}
