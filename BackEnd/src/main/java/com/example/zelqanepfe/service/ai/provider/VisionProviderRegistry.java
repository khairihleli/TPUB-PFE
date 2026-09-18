package com.example.zelqanepfe.service.ai.provider;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.AiProviderType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Chooses the effective vision provider from {@code zelqane.analysis.provider.type} (docs/round2-contract.md §2.1):
 * a provider without its key degrades to the local analysis, with one WARN at startup.
 */
@Slf4j
@Component
public class VisionProviderRegistry {

    private final AiAnalysisProperties properties;
    private final VisionModerationProvider openAi;
    private final VisionModerationProvider anthropic;

    @Autowired
    public VisionProviderRegistry(AiAnalysisProperties properties) {
        this(properties, new OpenAiVisionProvider(properties), new AnthropicVisionProvider(properties));
    }

    public VisionProviderRegistry(AiAnalysisProperties properties, VisionModerationProvider openAi,
                                  VisionModerationProvider anthropic) {
        this.properties = properties;
        this.openAi = openAi;
        this.anthropic = anthropic;
        requested().ifPresent(provider -> {
            if (!provider.isConfigured()) {
                log.warn("Fournisseur IA `{}` sans clé : analyse locale seule", properties.getProvider().normalizedType());
            } else {
                log.info("Analyse IA complémentaire : {} ({})", provider.type(), provider.model());
            }
        });
        String type = properties.getProvider().normalizedType();
        if (!type.equals("local") && !type.equals("openai") && !type.equals("anthropic")) {
            log.warn("Fournisseur IA `{}` inconnu : analyse locale seule", type);
        }
    }

    /** The configured provider when its key is present; empty = local analysis only. */
    public Optional<VisionModerationProvider> active() {
        return requested().filter(VisionModerationProvider::isConfigured);
    }

    /** LOCAL, OPENAI or ANTHROPIC as requested by the configuration (before the key check). */
    public AiProviderType requestedType() {
        return requested().map(VisionModerationProvider::type).orElse(AiProviderType.LOCAL);
    }

    public Optional<VisionModerationProvider> requested() {
        return switch (properties.getProvider().normalizedType()) {
            case "openai" -> Optional.of(openAi);
            case "anthropic" -> Optional.of(anthropic);
            default -> Optional.empty();
        };
    }
}
