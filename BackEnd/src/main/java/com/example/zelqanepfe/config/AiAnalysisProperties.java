package com.example.zelqanepfe.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Locale;

/**
 * AI analysis configuration (docs/round2-contract.md §2.1), prefix {@code zelqane.analysis}.
 * <p>
 * Defaults are read from the documented environment variables ({@code ZELQANE_OCR_MODE}, {@code ZELQANE_AI_PROVIDER},
 * {@code OPENAI_API_KEY}…) so that {@code application.yml} needs no entry; explicit properties still win.
 * The legacy {@code zelqane.ai.openai-enabled} and {@code zelqane.ai.ocr.*} keys are ignored.
 */
@Data
@ConfigurationProperties(prefix = "zelqane.analysis")
public class AiAnalysisProperties {

    private Ocr ocr = new Ocr();
    private Video video = new Video();
    private Image image = new Image();
    private Provider provider = new Provider();
    private Learning learning = new Learning();

    @Data
    public static class Ocr {
        /** {@code auto}, {@code tess4j} (legacy {@code tesseract}) or {@code simulated}. */
        private String mode = env("ZELQANE_OCR_MODE", "auto");
        private String tessdataPath = env("ZELQANE_OCR_TESSDATA", "./tessdata");
        private String languages = env("ZELQANE_OCR_LANGUAGES", "fra+eng+ara");
        private int timeoutSeconds = 20;
        private int minWordConfidence = 50;
        private int maxThreads = 2;
    }

    @Data
    public static class Video {
        private int timeoutSeconds = 20;
    }

    @Data
    public static class Image {
        private int analysisMaxSide = 512;
    }

    @Data
    public static class Provider {
        /** {@code local}, {@code openai} or {@code anthropic}. */
        private String type = env("ZELQANE_AI_PROVIDER", "local");
        private long timeoutMs = envLong("ZELQANE_AI_PROVIDER_TIMEOUT_MS", 90_000L);
        private int maxImages = 4;
        private Credentials openai = new Credentials(env("OPENAI_API_KEY", ""), env("OPENAI_MODEL", "gpt-4o-mini"));
        private Credentials anthropic = new Credentials(env("ANTHROPIC_API_KEY", ""),
                env("ANTHROPIC_MODEL", "claude-opus-5"));

        public String normalizedType() {
            return type == null ? "local" : type.trim().toLowerCase(Locale.ROOT);
        }
    }

    @Data
    public static class Credentials {
        private String apiKey;
        private String model;

        public Credentials() {
        }

        public Credentials(String apiKey, String model) {
            this.apiKey = apiKey;
            this.model = model;
        }

        public boolean hasKey() {
            return apiKey != null && !apiKey.isBlank();
        }
    }

    @Data
    public static class Learning {
        private boolean enabled = envBoolean("ZELQANE_AI_LEARNING_ENABLED", true);
        private boolean autoApply = envBoolean("ZELQANE_AI_LEARNING_AUTO_APPLY", true);
        private String cron = "0 30 3 * * *";
        private int windowDays = 180;
        private int minFeedback = 20;
        private int minRuleSupport = 3;
    }

    static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    static long envLong(String name, long fallback) {
        try {
            return Long.parseLong(env(name, Long.toString(fallback)));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    static boolean envBoolean(String name, boolean fallback) {
        String value = env(name, null);
        return value == null ? fallback : Boolean.parseBoolean(value);
    }
}
