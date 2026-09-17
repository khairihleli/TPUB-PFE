package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.AiMediaAnalysis;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class OpenAiAnalysisClient {

    private static final String SYSTEM_PROMPT = """
            Tu es un modérateur de contenu publicitaire pour la plateforme TPUB (Tunisie).
            Analyse le contenu d'une campagne publicitaire et détecte :
            - contenu trompeur ou mensonger (ex: "gratuit garanti", fausses promesses)
            - contenu offensant, discriminatoire ou illégal
            - qualité rédactionnelle insuffisante
            - incohérence budget/objectif
            Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
            {
              "aiStatus": "APPROVED" | "REVIEW_REQUIRED" | "REJECTED",
              "riskScore": 0-100,
              "qualityScore": 0-100,
              "detectedIssues": ["issue1", "issue2"],
              "recommendation": "conseil en français",
              "reason": "résumé court en français"
            }
            Règles :
            - APPROVED : risque <= 30, contenu conforme
            - REVIEW_REQUIRED : risque 31-70 ou doute
            - REJECTED : risque > 70 ou contenu clairement interdit
            """;

    private final TpubProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OpenAiAnalysisClient(TpubProperties properties) {
        this.properties = properties;
        this.restClient = RestClient.builder()
                .baseUrl("https://api.openai.com/v1")
                .build();
    }

    public boolean isConfigured() {
        TpubProperties.Ai ai = properties.getAi();
        return ai.isOpenaiEnabled()
                && ai.getOpenaiApiKey() != null
                && !ai.getOpenaiApiKey().isBlank();
    }

    public AiAnalysisResult analyze(Campaign campaign, ContentAnalysisPipeline.AnalysisOutcome local) {
        String userPrompt = buildUserPrompt(campaign, local);

        try {
            JsonNode response = restClient.post()
                    .uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + properties.getAi().getOpenaiApiKey())
                    .body(buildRequestBody(userPrompt))
                    .retrieve()
                    .body(JsonNode.class);

            String content = response
                    .path("choices").get(0)
                    .path("message").path("content").asText();

            return parseAnalysis(content);
        } catch (RestClientException ex) {
            log.error("OpenAI analysis failed for campaign {}: {}", campaign.getId(), ex.getMessage());
            throw ex;
        }
    }

    private Map<String, Object> buildRequestBody(String userPrompt) {
        return Map.of(
                "model", properties.getAi().getOpenaiModel(),
                "response_format", Map.of("type", "json_object"),
                "temperature", 0.2,
                "messages", List.of(
                        Map.of("role", "system", "content", SYSTEM_PROMPT),
                        Map.of("role", "user", "content", userPrompt)
                )
        );
    }

    private String buildUserPrompt(Campaign campaign, ContentAnalysisPipeline.AnalysisOutcome local) {
        List<AiMediaAnalysis> media = local.mediaAnalyses();
        String mediaSummary = media == null || media.isEmpty()
                ? "Aucun média joint"
                : media.stream()
                .map(m -> "- " + m.getFileName() + " (" + m.getContentType()
                        + (m.getWidthPx() != null && m.getHeightPx() != null ? ", " + m.getWidthPx() + "x" + m.getHeightPx() + " px" : "")
                        + (m.getDurationSeconds() != null ? ", " + m.getDurationSeconds() + " s" : "")
                        + ")")
                .collect(Collectors.joining("\n"));

        return """
                Analyse cette campagne publicitaire :

                Nom : %s
                Objectif : %s
                Budget : %s TND
                Période : %s → %s

                Texte extrait des visuels (OCR) :
                %s

                Médias :
                %s
                """.formatted(
                campaign.getName(),
                campaign.getObjective() != null ? campaign.getObjective() : "Non renseigné",
                campaign.getBudget(),
                campaign.getStartDate(),
                campaign.getEndDate(),
                local.extractedText() != null ? local.extractedText() : "Aucun",
                mediaSummary
        );
    }

    private AiAnalysisResult parseAnalysis(String jsonContent) {
        try {
            JsonNode node = objectMapper.readTree(jsonContent);

            AiCheckStatus status = AiCheckStatus.valueOf(node.path("aiStatus").asText("REVIEW_REQUIRED"));
            int riskScore = clamp(node.path("riskScore").asInt(50));
            int qualityScore = clamp(node.path("qualityScore").asInt(50));

            List<String> issues = new ArrayList<>();
            node.path("detectedIssues").forEach(item -> issues.add(item.asText()));

            String recommendation = node.path("recommendation").asText("Vérification manuelle recommandée");
            String reason = node.path("reason").asText("Analyse OpenAI");

            return new AiAnalysisResult(status, riskScore, qualityScore, issues, recommendation, reason);
        } catch (Exception ex) {
            log.warn("Failed to parse OpenAI JSON response: {}", ex.getMessage());
            return new AiAnalysisResult(
                    AiCheckStatus.REVIEW_REQUIRED,
                    50,
                    50,
                    List.of("réponse IA invalide"),
                    "Vérification manuelle requise",
                    "Erreur parsing réponse OpenAI"
            );
        }
    }

    private int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }
}
