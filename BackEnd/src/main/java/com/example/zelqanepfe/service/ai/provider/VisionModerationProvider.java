package com.example.zelqanepfe.service.ai.provider;

import com.example.zelqanepfe.model.AiCheckStatus;
import com.example.zelqanepfe.model.AiProviderType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Optional LLM vision moderation, merged into the local analysis (docs/round2-contract.md §2.5).
 */
public interface VisionModerationProvider {

    /** OPENAI or ANTHROPIC. */
    AiProviderType type();

    /** A key is configured. */
    boolean isConfigured();

    /** Configured model name. */
    String model();

    /** @throws ProviderException on any failure (transport, HTTP status, refusal, unparsable verdict) */
    ProviderVerdict analyze(ProviderRequest request);

    record ProviderRequest(Long campaignId, String name, String objective, BigDecimal budget, LocalDate startDate,
                           LocalDate endDate, String ocrText, List<String> mediaSummaries, List<ProviderImage> images) {

        public ProviderRequest {
            mediaSummaries = mediaSummaries == null ? List.of() : List.copyOf(mediaSummaries);
            images = images == null ? List.of() : List.copyOf(images);
        }
    }

    /** JPEG q0.85, longest side ≤ 1024. */
    record ProviderImage(String mediaType, byte[] data) {
    }

    record ProviderVerdict(AiCheckStatus status, int riskScore, int qualityScore, List<String> issues,
                           String recommendation, String reason, String model) {

        public ProviderVerdict {
            issues = issues == null ? List.of() : List.copyOf(issues);
        }
    }

    class ProviderException extends RuntimeException {

        public ProviderException(String message) {
            super(message);
        }

        public ProviderException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
