package com.example.zelqanepfe.config;

import com.example.zelqanepfe.model.SupportType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Data
@ConfigurationProperties(prefix = "zelqane")
public class ZelqaneProperties {

    private Jwt jwt = new Jwt();
    private Media media = new Media();
    private Cors cors = new Cors();
    /** Lane A: business time zone used by the injected {@link java.time.Clock}. */
    private String timezone = "Africa/Tunis";
    /** Lane A: scheduler switch (disabled in tests). */
    private Scheduler scheduler = new Scheduler();
    /** Lane B: temporary reservation expiry. */
    private Reservation reservation = new Reservation();
    /** Lane B: diffusion engine settings. */
    private Diffusion diffusion = new Diffusion();
    /** Lane B: internal simulation constants of the estimation formula (contract §2.6). */
    private Pricing pricing = new Pricing();
    /** Lane C: session tracking; round 2 (L2): TOTP and admin bootstrap. */
    private Security security = new Security();
    /** Round 2 (L2): player device keys (docs/round2-contract.md §3.4). */
    private Device device = new Device();

    @Data
    public static class Security {
        /** Minimum delay between two {@code user_sessions.last_seen_at} updates. */
        private long sessionTouchSeconds = 60;
        private Totp totp = new Totp();
        private BootstrapAdmin bootstrapAdmin = new BootstrapAdmin();
    }

    @Data
    public static class Totp {
        private String issuer = "ZELQANE";
        /** Empty or shorter than 32 bytes: derived from the JWT secret. */
        private String encryptionKey;
        /** Staff roles that must enrol (ADMINISTRATEUR, SUPERVISEUR, OPERATEUR); ANNONCEUR is ignored. */
        private List<String> requiredRoles = List.of();
        private long challengeTtlSeconds = 300;
        private int maxAttempts = 5;
    }

    @Data
    public static class BootstrapAdmin {
        private String email = "admin@zelqane.local";
        /** Empty: a random password is generated and logged once. */
        private String initialPassword;
        private boolean mustChangePassword = true;
    }

    @Data
    public static class Device {
        private RateLimit rateLimit = new RateLimit();
        private int invalidKeyPerMinutePerIp = 20;
        /** Minimum delay between two {@code last_used_at} updates of a key. */
        private long touchSeconds = 60;
    }

    @Data
    public static class RateLimit {
        private int perMinute = 120;
        private int burst = 30;
    }

    @Data
    public static class Reservation {
        private long temporaryTtlHours = 72;
    }

    @Data
    public static class Diffusion {
        private int maxPerHour = 30;
        private int defaultDurationSeconds = 10;
        private String defaultTitle = "ZELQANE — Tukhnanutha";
        private String defaultContent = "Espace de diffusion ZELQANE";
        /** Empty means null. */
        private String defaultMediaUrl;
        /** Round 2 (L2): honour {@code ?datetime=} of {@code /api/diffusion/next} (demo only). */
        private boolean simulatedTimeEnabled = false;
    }

    @Data
    public static class Pricing {
        private Map<SupportType, Integer> baseViewsPerHour = new EnumMap<>(Map.of(
                SupportType.ECRAN, 120,
                SupportType.PANNEAU_NUMERIQUE, 90,
                SupportType.POINT_WIFI, 40,
                SupportType.APPLICATION, 200,
                SupportType.SITE_WEB, 250));
        private Map<SupportType, BigDecimal> cpmTnd = new EnumMap<>(Map.of(
                SupportType.ECRAN, new BigDecimal("8.000"),
                SupportType.PANNEAU_NUMERIQUE, new BigDecimal("6.000"),
                SupportType.POINT_WIFI, new BigDecimal("3.000"),
                SupportType.APPLICATION, new BigDecimal("4.000"),
                SupportType.SITE_WEB, new BigDecimal("3.500")));
    }

    @Data
    public static class Scheduler {
        private boolean enabled = true;
    }

    @Data
    public static class Jwt {
        private String secret;
        private long expirationMs;
        private long refreshExpirationMs;
    }

    @Data
    public static class Media {
        private String uploadDir;
        private String baseUrl;
        /** Lane B upload limits. */
        private long maxImageBytes = 10_485_760L;
        private long maxVideoBytes = 52_428_800L;
        private int maxFilesPerCampaign = 5;
        /** Round 2 (L2): HMAC key of signed media URLs; empty or shorter than 32 bytes → derived from the JWT secret. */
        private String signingSecret;
        private long signedUrlTtlSeconds = 3600;
        /**
         * Durable copy of the uploads (Cloudflare R2 through the zelqane-media Worker, deploy/media-store). Empty
         * URL → local disk only. The local directory then acts as a cache refilled on demand.
         */
        private String remoteUrl;
        private String remoteToken;
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins;
    }
}
