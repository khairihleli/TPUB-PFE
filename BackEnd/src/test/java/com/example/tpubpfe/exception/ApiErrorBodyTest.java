package com.example.tpubpfe.exception;

import com.example.tpubpfe.config.ValidationMessagesAccess;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ApiErrorBodyTest {

    @Test
    void bodyHasContractShapeAndEscapesJson() {
        Map<String, String> errors = new LinkedHashMap<>();
        errors.put("nom", "Champ \"obligatoire\".");
        Map<String, Object> body = ApiErrorBody.of(HttpStatus.UNAUTHORIZED, "TOKEN_INVALID", "Jeton\ninvalide", "/api/me", errors);

        assertThat(body).containsKeys("timestamp", "status", "code", "message", "path", "errors");
        String json = ApiErrorBody.toJson(body);
        assertThat(json)
                .contains("\"status\":401")
                .contains("\"code\":\"TOKEN_INVALID\"")
                .contains("\"message\":\"Jeton\\ninvalide\"")
                .contains("\"errors\":{\"nom\":\"Champ \\\"obligatoire\\\".\"}");
    }

    @Test
    void errorsAreOmittedWhenEmpty() {
        assertThat(ApiErrorBody.of(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "x", "/p", Map.of())).doesNotContainKey("errors");
    }

    @Test
    void constraintCodesMapToFrenchMessages() {
        assertThat(ValidationMessagesAccess.fromCode("Size", Map.of("min", 8, "max", 100)))
                .isEqualTo("Doit contenir entre 8 et 100 caractères.");
        assertThat(ValidationMessagesAccess.fromCode("Size", Map.of("min", 0, "max", 200)))
                .isEqualTo("Doit contenir au plus 200 caractères.");
        assertThat(ValidationMessagesAccess.fromCode("DecimalMin", Map.of("value", "0.10", "inclusive", true)))
                .isEqualTo("Doit être supérieur ou égal à 0.1.");
        assertThat(ValidationMessagesAccess.fromCode("Email", Map.of())).isEqualTo("Adresse e-mail invalide.");
        assertThat(ValidationMessagesAccess.fromCode("NotNull", Map.of())).isEqualTo("Champ obligatoire.");
    }
}
