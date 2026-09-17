package com.example.tpubpfe.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/**
 * Round-2 lane L4 configuration (docs/round2-contract.md §5.1): one properties class per prefix, registered by
 * {@link SupervisionConfig}.
 */
public final class SupervisionProperties {

    private SupervisionProperties() {
    }

    /** {@code tpub.supervision.*}: heartbeat, presence, saturation and SSE transport. */
    @Data
    @ConfigurationProperties(prefix = "tpub.supervision")
    public static class Supervision {
        private int heartbeatIntervalSeconds = 30;
        private int offlineTimeoutSeconds = 90;
        private String presenceCheckCron = "*/15 * * * * *";
        private BigDecimal saturationThreshold = new BigDecimal("0.90");
        private String saturationCron = "0 */5 * * * *";
        private long emitterTimeoutMinutes = 30;
        private int keepaliveSeconds = 20;
        private int maxEmitters = 200;
    }

    /** {@code tpub.approval.*}: multi-level approval policy ({@code 1} disables a double approval). */
    @Data
    @ConfigurationProperties(prefix = "tpub.approval")
    public static class Approval {
        private int emergencyRequiredApprovals = 2;
        private int campaignRequiredApprovals = 2;
        private int campaignRiskThreshold = 50;
    }

    /** {@code tpub.notifications.*}: retention and optional e-mail delivery. */
    @Data
    @ConfigurationProperties(prefix = "tpub.notifications")
    public static class Notifications {
        private int retentionDays = 90;
        private Mail mail = new Mail();

        @Data
        public static class Mail {
            /** Empty = mail disabled. */
            private String from = "";
            /** INFO, AVERTISSEMENT or CRITIQUE. */
            private String minSeverity = "CRITIQUE";
            private String baseUrl = "http://localhost:3000";
        }
    }
}
