package com.example.tpubpfe.service.ai.provider;

import com.example.tpubpfe.config.AiAnalysisProperties;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiProviderType;
import com.example.tpubpfe.service.ai.provider.VisionModerationProvider.ProviderException;
import com.example.tpubpfe.service.ai.provider.VisionModerationProvider.ProviderImage;
import com.example.tpubpfe.service.ai.provider.VisionModerationProvider.ProviderRequest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VisionProvidersTest {

    private static final String VERDICT = "{\"aiStatus\":\"REVIEW_REQUIRED\",\"riskScore\":140,\"qualityScore\":62,"
            + "\"detectedIssues\":[\"allégation santé\",\" \"],\"recommendation\":\"Précisez l'offre\",\"reason\":\"doute\"}";

    private record Call(String url, Map<String, String> headers, JsonNode body) {
    }

    private static ProviderRequest request() {
        return new ProviderRequest(5L, "Clinique", "Soins dentaires", new BigDecimal("300"), LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 31), "SOURIRE", List.of("affiche.jpg (image, 1920×1080 px)"),
                List.of(new ProviderImage("image/jpeg", new byte[]{1, 2, 3})));
    }

    private static AiAnalysisProperties.Credentials key(String model) {
        return new AiAnalysisProperties.Credentials("sk-test-secret", model);
    }

    @Test
    void anthropicSendsImagesFirstStructuredOutputAndFallbacks() {
        List<Call> calls = new ArrayList<>();
        AnthropicVisionProvider provider = new AnthropicVisionProvider(key("claude-opus-5"), (url, headers, body) -> {
            calls.add(new Call(url, headers, ModerationPrompt.JSON.readTree(body)));
            return new JsonHttpTransport.Response(200, "{\"model\":\"claude-opus-4-8\",\"stop_reason\":\"end_turn\","
                    + "\"content\":[{\"type\":\"text\",\"text\":" + ModerationPrompt.JSON.writeValueAsString(VERDICT) + "}]}");
        });

        var verdict = provider.analyze(request());

        assertThat(verdict.status()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(verdict.riskScore()).isEqualTo(100);
        assertThat(verdict.qualityScore()).isEqualTo(62);
        assertThat(verdict.issues()).containsExactly("allégation santé");
        // server-side fallback may answer with another model
        assertThat(verdict.model()).isEqualTo("claude-opus-4-8");

        Call call = calls.get(0);
        assertThat(call.url()).isEqualTo("https://api.anthropic.com/v1/messages");
        assertThat(call.headers()).containsEntry("x-api-key", "sk-test-secret")
                .containsEntry("anthropic-version", "2023-06-01")
                .containsEntry("anthropic-beta", "server-side-fallback-2026-07-01");
        JsonNode body = call.body();
        assertThat(body.path("model").asString()).isEqualTo("claude-opus-5");
        assertThat(body.path("max_tokens").asInt()).isEqualTo(16000);
        assertThat(body.path("fallbacks").asString()).isEqualTo("default");
        assertThat(body.path("output_config").path("effort").asString()).isEqualTo("medium");
        assertThat(body.path("output_config").path("format").path("type").asString()).isEqualTo("json_schema");
        assertThat(body.has("temperature")).isFalse();
        assertThat(body.has("thinking")).isFalse();
        assertThat(body.path("system").asString()).contains("Analyse aussi les images fournies");
        JsonNode content = body.path("messages").path(0).path("content");
        assertThat(content.path(0).path("type").asString()).isEqualTo("image");
        assertThat(content.path(0).path("source").path("data").asString()).isEqualTo("AQID");
        assertThat(content.path(1).path("type").asString()).isEqualTo("text");
        assertThat(content.path(1).path("text").asString()).contains("Clinique", "SOURIRE", "affiche.jpg");
    }

    @Test
    void anthropicRetriesOnceWithoutStructuredOutputAndHandlesStopReasons() {
        List<JsonNode> bodies = new ArrayList<>();
        AnthropicVisionProvider retrying = new AnthropicVisionProvider(key(null), (url, headers, body) -> {
            bodies.add(ModerationPrompt.JSON.readTree(body));
            if (bodies.size() == 1) {
                return new JsonHttpTransport.Response(400, "{\"error\":{\"message\":\"output_config.format: unsupported\"}}");
            }
            return new JsonHttpTransport.Response(200, "{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\","
                    + "\"text\":\"```json\\n{\\\"aiStatus\\\":\\\"APPROVED\\\",\\\"riskScore\\\":5,\\\"qualityScore\\\":90,"
                    + "\\\"detectedIssues\\\":[],\\\"recommendation\\\":\\\"\\\",\\\"reason\\\":\\\"ok\\\"}\\n```\"}]}");
        });
        var verdict = retrying.analyze(request());
        assertThat(verdict.status()).isEqualTo(AiCheckStatus.APPROVED);
        assertThat(verdict.model()).isEqualTo("claude-opus-5");
        assertThat(bodies).hasSize(2);
        assertThat(bodies.get(1).path("output_config").has("format")).isFalse();
        assertThat(bodies.get(1).path("system").asString()).endsWith("Réponds uniquement en JSON.");

        assertThatThrownBy(() -> new AnthropicVisionProvider(key(null), (u, h, b) -> new JsonHttpTransport.Response(200,
                "{\"stop_reason\":\"refusal\",\"stop_details\":{\"category\":\"cyber\"},\"content\":[]}")).analyze(request()))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new AnthropicVisionProvider(key(null), (u, h, b) -> new JsonHttpTransport.Response(200,
                "{\"stop_reason\":\"max_tokens\",\"content\":[{\"type\":\"text\",\"text\":\"{\"}]}")).analyze(request()))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new AnthropicVisionProvider(key(null), (u, h, b) -> new JsonHttpTransport.Response(500,
                "boom")).analyze(request()))
                .isInstanceOf(ProviderException.class).hasMessage("HTTP 500");
        assertThatThrownBy(() -> new AnthropicVisionProvider(new AiAnalysisProperties.Credentials("", null),
                (u, h, b) -> null).analyze(request())).isInstanceOf(ProviderException.class);
    }

    @Test
    void openAiSendsTextThenImagesAsDataUrls() {
        List<JsonNode> bodies = new ArrayList<>();
        OpenAiVisionProvider provider = new OpenAiVisionProvider(key("gpt-4o-mini"), (url, headers, body) -> {
            assertThat(url).isEqualTo("https://api.openai.com/v1/chat/completions");
            assertThat(headers).containsEntry("Authorization", "Bearer sk-test-secret");
            bodies.add(ModerationPrompt.JSON.readTree(body));
            return new JsonHttpTransport.Response(200, "{\"model\":\"gpt-4o-mini-2024\",\"choices\":[{\"finish_reason\":\"stop\","
                    + "\"message\":{\"content\":" + ModerationPrompt.JSON.writeValueAsString(VERDICT) + "}}]}");
        });
        var verdict = provider.analyze(request());
        assertThat(verdict.model()).isEqualTo("gpt-4o-mini-2024");
        JsonNode body = bodies.get(0);
        assertThat(body.path("response_format").path("type").asString()).isEqualTo("json_object");
        assertThat(body.path("temperature").asDouble()).isEqualTo(0.2);
        JsonNode user = body.path("messages").path(1).path("content");
        assertThat(user.path(0).path("type").asString()).isEqualTo("text");
        assertThat(user.path(1).path("image_url").path("url").asString()).isEqualTo("data:image/jpeg;base64,AQID");

        assertThatThrownBy(() -> new OpenAiVisionProvider(key(null), (u, h, b) -> new JsonHttpTransport.Response(200,
                "{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\"}}]}")).analyze(request()))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new OpenAiVisionProvider(key(null), (u, h, b) -> new JsonHttpTransport.Response(200,
                "{\"choices\":[{\"message\":{\"content\":\"{\\\"aiStatus\\\":\\\"PEUT-ETRE\\\"}\"}}]}")).analyze(request()))
                .isInstanceOf(ProviderException.class);
    }

    @Test
    void registryUsesTheConfiguredProviderOnlyWithAKey() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        FakeProvider openAi = new FakeProvider(AiProviderType.OPENAI, true);
        FakeProvider anthropic = new FakeProvider(AiProviderType.ANTHROPIC, false);

        properties.getProvider().setType("local");
        assertThat(new VisionProviderRegistry(properties, openAi, anthropic).active()).isEmpty();

        properties.getProvider().setType(" OpenAI ");
        assertThat(new VisionProviderRegistry(properties, openAi, anthropic).active()).containsSame(openAi);

        properties.getProvider().setType("anthropic");
        VisionProviderRegistry registry = new VisionProviderRegistry(properties, openAi, anthropic);
        assertThat(registry.active()).isEmpty();
        assertThat(registry.requestedType()).isEqualTo(AiProviderType.ANTHROPIC);
    }

    @Test
    void verdictSchemaIsStrict() {
        Map<String, Object> schema = ModerationPrompt.verdictSchema();
        assertThat(schema).containsEntry("additionalProperties", false);
        assertThat((List<?>) schema.get("required")).hasSize(6);
    }

    private record FakeProvider(AiProviderType type, boolean isConfigured) implements VisionModerationProvider {
        @Override
        public String model() {
            return "fake";
        }

        @Override
        public ProviderVerdict analyze(ProviderRequest request) {
            throw new ProviderException("unused");
        }
    }
}
