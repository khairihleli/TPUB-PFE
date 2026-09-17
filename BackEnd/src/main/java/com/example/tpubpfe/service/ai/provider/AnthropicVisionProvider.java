package com.example.tpubpfe.service.ai.provider;

import com.example.tpubpfe.config.AiAnalysisProperties;
import com.example.tpubpfe.model.AiProviderType;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Claude vision moderation through the Messages API over plain HTTP (docs/round2-contract.md §2.5): images then
 * text, structured JSON output, server-side fallbacks. {@code temperature}, {@code thinking} and
 * {@code budget_tokens} are never sent.
 */
@Slf4j
public class AnthropicVisionProvider implements VisionModerationProvider {

    static final String URL = "https://api.anthropic.com/v1/messages";
    static final String VERSION = "2023-06-01";
    static final String BETA = "server-side-fallback-2026-07-01";
    static final int MAX_TOKENS = 16000;

    private final AiAnalysisProperties.Credentials credentials;
    private final JsonHttpTransport transport;

    public AnthropicVisionProvider(AiAnalysisProperties properties) {
        this(properties.getProvider().getAnthropic(),
                JsonHttpTransport.restClient(Duration.ofMillis(Math.max(1000, properties.getProvider().getTimeoutMs()))));
    }

    AnthropicVisionProvider(AiAnalysisProperties.Credentials credentials, JsonHttpTransport transport) {
        this.credentials = credentials;
        this.transport = transport;
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.ANTHROPIC;
    }

    @Override
    public boolean isConfigured() {
        return credentials != null && credentials.hasKey();
    }

    @Override
    public String model() {
        return credentials.getModel() == null || credentials.getModel().isBlank() ? "claude-opus-5" : credentials.getModel();
    }

    @Override
    public ProviderVerdict analyze(ProviderRequest request) {
        if (!isConfigured()) {
            throw new ProviderException("clé API absente");
        }
        JsonHttpTransport.Response response = transport.post(URL, headers(), body(request, true));
        if (response.status() == 400 && mentionsStructuredOutput(response.body())) {
            log.info("Sorties structurées refusées par l'API Anthropic : nouvel essai en JSON libre");
            response = transport.post(URL, headers(), body(request, false));
        }
        if (!response.ok()) {
            throw new ProviderException("HTTP " + response.status());
        }
        JsonNode root;
        try {
            root = ModerationPrompt.JSON.readTree(response.body());
        } catch (RuntimeException ex) {
            throw new ProviderException("réponse illisible", ex);
        }
        String stopReason = root.path("stop_reason").asString("");
        if ("refusal".equals(stopReason)) {
            String category = root.path("stop_details").path("category").asString("");
            log.warn("Analyse Claude refusée pour la campagne {} (catégorie : {})", request.campaignId(),
                    category.isBlank() ? "non précisée" : category);
            throw new ProviderException("refus du modèle");
        }
        if ("max_tokens".equals(stopReason)) {
            throw new ProviderException("réponse tronquée (max_tokens)");
        }
        String text = null;
        for (JsonNode block : root.path("content")) {
            if ("text".equals(block.path("type").asString(""))) {
                text = block.path("text").asString("");
                break;
            }
        }
        String answeredModel = root.path("model").asString("");
        return ModerationPrompt.parseVerdict(text, answeredModel.isBlank() ? model() : answeredModel);
    }

    Map<String, String> headers() {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("x-api-key", credentials.getApiKey());
        headers.put("anthropic-version", VERSION);
        headers.put("anthropic-beta", BETA);
        headers.put("content-type", "application/json");
        return headers;
    }

    String body(ProviderRequest request, boolean structured) {
        List<Map<String, Object>> content = new ArrayList<>();
        for (ProviderImage image : request.images()) {
            content.add(Map.of("type", "image", "source", Map.of(
                    "type", "base64",
                    "media_type", image.mediaType(),
                    "data", Base64.getEncoder().encodeToString(image.data()))));
        }
        content.add(Map.of("type", "text", "text", ModerationPrompt.userText(request)));

        Map<String, Object> outputConfig = new LinkedHashMap<>();
        outputConfig.put("effort", "medium");
        if (structured) {
            outputConfig.put("format", Map.of("type", "json_schema", "schema", ModerationPrompt.verdictSchema()));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model());
        body.put("max_tokens", MAX_TOKENS);
        body.put("fallbacks", "default");
        body.put("output_config", outputConfig);
        body.put("system", structured ? ModerationPrompt.SYSTEM_PROMPT : ModerationPrompt.SYSTEM_PROMPT + ModerationPrompt.JSON_ONLY);
        body.put("messages", List.of(Map.of("role", "user", "content", content)));
        return ModerationPrompt.JSON.writeValueAsString(body);
    }

    static boolean mentionsStructuredOutput(String body) {
        String lower = body == null ? "" : body.toLowerCase(Locale.ROOT);
        return lower.contains("output_config") || lower.contains("json_schema") || lower.contains("structured output");
    }
}
