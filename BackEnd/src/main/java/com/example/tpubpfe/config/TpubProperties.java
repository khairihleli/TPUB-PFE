package com.example.tpubpfe.config;

import com.example.tpubpfe.model.SupportType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Data
@ConfigurationProperties(prefix = "tpub")
public class TpubProperties {

    private Jwt jwt = new Jwt();
    private Media media = new Media();
    private Ai ai = new Ai();
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
    /** Lane C: session tracking. */
    private Security security = new Security();

    @Data
    public static class Security {
        /** Minimum delay between two {@code user_sessions.last_seen_at} updates. */
        private long sessionTouchSeconds = 60;
    }

    @Data
    public static class Reservation {
        private long temporaryTtlHours = 72;
    }

    @Data
    public static class Diffusion {
        private int maxPerHour = 30;
        private int defaultDurationSeconds = 10;
        private String defaultTitle = "TPUB — Tukhnanutha";
        private String defaultContent = "Espace de diffusion TPUB";
        /** Empty means null. */
        private String defaultMediaUrl;
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
    }

    @Data
    public static class Ai {
        private String serviceUrl;
        private long timeoutMs;
        private boolean openaiEnabled = true;
        private String openaiApiKey;
        private String openaiModel = "gpt-4o-mini";
        /** Lane A: OCR engine selection. */
        private Ocr ocr = new Ocr();
    }

    @Data
    public static class Ocr {
        /** {@code auto}, {@code tesseract} or {@code simulated}. */
        private String mode = "auto";
        private String command = "tesseract";
        private String languages = "fra+eng";
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins;
    }
}
