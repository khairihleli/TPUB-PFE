package com.example.zelqanepfe.service.ai.provider;

import com.example.zelqanepfe.model.AiCheckStatus;
import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider.ProviderException;
import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider.ProviderRequest;
import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider.ProviderVerdict;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Shared French moderator prompt, verdict schema and verdict parsing for every provider (§2.5). */
public final class ModerationPrompt {

    public static final int MAX_ISSUES = 10;

    public static final String SYSTEM_PROMPT = """
            Tu es un modérateur de contenu publicitaire pour la plateforme ZELQANE (Tunisie).
            Analyse le contenu d'une campagne publicitaire et détecte :
            - contenu trompeur ou mensonger (ex: "gratuit garanti", fausses promesses)
            - contenu offensant, discriminatoire ou illégal
            - qualité rédactionnelle insuffisante
            - incohérence budget/objectif
            Analyse aussi les images fournies (texte, symboles, contenu choquant, qualité visuelle).
            Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
            {
              "aiStatus": "APPROVED" | "REVIEW_REQUIRED" | "REJECTED",
              "riskScore": 0-100,
              "qualityScore": 0-100,
              "detectedIssues": ["problème 1", "problème 2"],
              "recommendation": "conseil en français",
              "reason": "résumé court en français"
            }
            Règles :
            - APPROVED : risque <= 30, contenu conforme
            - REVIEW_REQUIRED : risque 31-70 ou doute
            - REJECTED : risque > 70 ou contenu clairement interdit
            - au plus 10 problèmes, rédigés en français
            """;

    static final String JSON_ONLY = "\nRéponds uniquement en JSON.";

    static final JsonMapper JSON = JsonMapper.builder().build();

    private ModerationPrompt() {
    }

    public static String userText(ProviderRequest request) {
        String media = request.mediaSummaries().isEmpty()
                ? "Aucun média joint"
                : String.join("\n", request.mediaSummaries().stream().map(s -> "- " + s).toList());
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

                Images jointes : %d
                """.formatted(
                orDash(request.name()),
                request.objective() == null || request.objective().isBlank() ? "Non renseigné" : request.objective(),
                request.budget() == null ? "Non renseigné" : request.budget().toPlainString(),
                request.startDate() == null ? "?" : request.startDate(),
                request.endDate() == null ? "?" : request.endDate(),
                request.ocrText() == null || request.ocrText().isBlank() ? "Aucun" : request.ocrText(),
                media,
                request.images().size());
    }

    /** JSON schema of the verdict (structured outputs). */
    public static Map<String, Object> verdictSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("aiStatus", Map.of("type", "string", "enum", List.of("APPROVED", "REVIEW_REQUIRED", "REJECTED")));
        properties.put("riskScore", Map.of("type", "integer"));
        properties.put("qualityScore", Map.of("type", "integer"));
        properties.put("detectedIssues", Map.of("type", "array", "items", Map.of("type", "string")));
        properties.put("recommendation", Map.of("type", "string"));
        properties.put("reason", Map.of("type", "string"));
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("aiStatus", "riskScore", "qualityScore", "detectedIssues", "recommendation", "reason"));
        schema.put("additionalProperties", false);
        return schema;
    }

    /** Parses a verdict JSON text (a surrounding Markdown code fence is tolerated). */
    public static ProviderVerdict parseVerdict(String text, String model) {
        if (text == null || text.isBlank()) {
            throw new ProviderException("réponse vide");
        }
        String json = text.trim();
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new ProviderException("réponse non JSON");
        }
        JsonNode node;
        try {
            node = JSON.readTree(json.substring(start, end + 1));
        } catch (RuntimeException ex) {
            throw new ProviderException("JSON invalide", ex);
        }
        AiCheckStatus status;
        try {
            status = AiCheckStatus.valueOf(node.path("aiStatus").asString("").trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ProviderException("statut IA invalide");
        }
        if (!node.path("riskScore").isNumber() || !node.path("qualityScore").isNumber()) {
            throw new ProviderException("scores absents");
        }
        List<String> issues = new ArrayList<>();
        for (JsonNode item : node.path("detectedIssues")) {
            String label = item.asString("").trim();
            if (!label.isEmpty() && issues.size() < MAX_ISSUES) {
                issues.add(label);
            }
        }
        return new ProviderVerdict(status, clamp(node.path("riskScore").asInt()), clamp(node.path("qualityScore").asInt()),
                issues, blankToNull(node.path("recommendation").asString("")), blankToNull(node.path("reason").asString("")),
                model);
    }

    static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String orDash(String value) {
        return value == null || value.isBlank() ? "—" : value;
    }
}
