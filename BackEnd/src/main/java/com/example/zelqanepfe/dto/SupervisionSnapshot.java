package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Full supervision state: first SSE event and JSON fallback (docs/round2-contract.md §5.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupervisionSnapshot {

    private Instant serverTime;
    @Builder.Default
    private List<SupportRow> supports = new ArrayList<>();
    @Builder.Default
    private List<EmergencyLiveEvent> emergencies = new ArrayList<>();
    @Builder.Default
    private List<SupervisionAlertResponse> alerts = new ArrayList<>();
    @Builder.Default
    private List<DiffusionLiveEvent> recentDiffusions = new ArrayList<>();
    private Stats stats;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SupportRow {
        private Long supportId;
        private String name;
        private Long zoneId;
        private String zoneName;
        private BigDecimal latitude;
        private BigDecimal longitude;
        private String technicalStatus;
        /** EN_LIGNE, HORS_LIGNE or INCONNU. */
        private String presence;
        private Instant lastHeartbeatAt;
        private String playerVersion;
        private CurrentDiffusion current;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentDiffusion {
        private String contentType;
        private String title;
        private Long campaignId;
        private Long emergencyId;
        private Instant diffusedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Stats {
        private long onlineSupports;
        private long offlineSupports;
        private long unknownSupports;
        private long diffusionsLastHour;
        private long activeEmergencies;
        private long openAlerts;
    }
}
