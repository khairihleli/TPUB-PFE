package com.example.tpubpfe.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Data
@ConfigurationProperties(prefix = "tpub")
public class TpubProperties {

    private Jwt jwt = new Jwt();
    private Media media = new Media();
    private Ai ai = new Ai();
    private Cors cors = new Cors();

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
    }

    @Data
    public static class Ai {
        private String serviceUrl;
        private long timeoutMs;
        private boolean openaiEnabled = true;
        private String openaiApiKey;
        private String openaiModel = "gpt-4o-mini";
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins;
    }
}
