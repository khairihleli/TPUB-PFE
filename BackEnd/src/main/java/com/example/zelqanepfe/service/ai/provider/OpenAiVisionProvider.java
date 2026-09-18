package com.example.zelqanepfe.service.ai.provider;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.AiProviderType;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI vision moderation through Chat Completions (docs/round2-contract.md §2.5): JSON object response,
 * temperature 0.2, a text part followed by image parts.
 */
public class OpenAiVisionProvider implements VisionModerationProvider {

    static final String URL = "https://api.openai.com/v1/chat/completions";

    private final AiAnalysisProperties.Credentials credentials;
    private final JsonHttpTransport transport;

    public OpenAiVisionProvider(AiAnalysisProperties properties) {
        this(properties.getProvider().getOpenai(),
                JsonHttpTransport.restClient(Duration.ofMillis(Math.max(1000, properties.getProvider().getTimeoutMs()))));
    }

    OpenAiVisionProvider(AiAnalysisProperties.Credentials credentials, JsonHttpTransport transport) {
        this.credentials = credentials;
        this.transport = transport;
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.OPENAI;
    }

    @Override
    public boolean isConfigured() {
        return credentials != null && credentials.hasKey();
    }

    @Override
    public String model() {
        return credentials.getModel() == null || credentials.getModel().isBlank() ? "gpt-4o-mini" : credentials.getModel();
    }

    @Override
    public ProviderVerdict analyze(ProviderRequest request) {
        if (!isConfigured()) {
            throw new ProviderException("clé API absente");
        }
        JsonHttpTransport.Response response = transport.post(URL,
                Map.of("Authorization", "Bearer " + credentials.getApiKey()), body(request));
        if (!response.ok()) {
            throw new ProviderException("HTTP " + response.status());
        }
        JsonNode root;
        try {
            root = ModerationPrompt.JSON.readTree(response.body());
        } catch (RuntimeException ex) {
            throw new ProviderException("réponse illisible", ex);
        }
        JsonNode choice = root.path("choices").path(0);
        String finish = choice.path("finish_reason").asString("");
        if ("length".equals(finish) || "content_filter".equals(finish)) {
            throw new ProviderException("réponse incomplète (" + finish + ")");
        }
        String answeredModel = root.path("model").asString("");
        return ModerationPrompt.parseVerdict(choice.path("message").path("content").asString(""),
                answeredModel.isBlank() ? model() : answeredModel);
    }

    String body(ProviderRequest request) {
        List<Map<String, Object>> userContent = new ArrayList<>();
        userContent.add(Map.of("type", "text", "text", ModerationPrompt.userText(request)));
        for (ProviderImage image : request.images()) {
            userContent.add(Map.of("type", "image_url", "image_url", Map.of("url",
                    "data:" + image.mediaType() + ";base64," + Base64.getEncoder().encodeToString(image.data()))));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model());
        body.put("response_format", Map.of("type", "json_object"));
        body.put("temperature", 0.2);
        body.put("messages", List.of(
                Map.of("role", "system", "content", ModerationPrompt.SYSTEM_PROMPT),
                Map.of("role", "user", "content", userContent)));
        return ModerationPrompt.JSON.writeValueAsString(body);
    }
}
