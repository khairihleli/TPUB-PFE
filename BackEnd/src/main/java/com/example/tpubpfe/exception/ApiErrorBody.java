package com.example.tpubpfe.exception;

import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Builds the single error body shape of the API (completion contract §2.0):
 * {@code { timestamp, status, code, message, path, errors? }}.
 */
public final class ApiErrorBody {

    private ApiErrorBody() {
    }

    public static Map<String, Object> of(HttpStatus status, String code, String message, String path,
                                         Map<String, String> errors) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", message);
        body.put("path", path);
        if (errors != null && !errors.isEmpty()) {
            body.put("errors", errors);
        }
        return body;
    }

    /** Minimal JSON serialisation of a body built by {@link #of} (strings, numbers and one string map). */
    public static String toJson(Map<String, Object> body) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> entry : body.entrySet()) {
            if (!first) {
                json.append(',');
            }
            first = false;
            appendString(json, entry.getKey());
            json.append(':');
            appendValue(json, entry.getValue());
        }
        return json.append('}').toString();
    }

    private static void appendValue(StringBuilder json, Object value) {
        if (value == null) {
            json.append("null");
        } else if (value instanceof Number number) {
            json.append(number);
        } else if (value instanceof Map<?, ?> map) {
            json.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> field : map.entrySet()) {
                if (!first) {
                    json.append(',');
                }
                first = false;
                appendString(json, String.valueOf(field.getKey()));
                json.append(':');
                if (field.getValue() == null) {
                    json.append("null");
                } else {
                    appendString(json, String.valueOf(field.getValue()));
                }
            }
            json.append('}');
        } else {
            appendString(json, String.valueOf(value));
        }
    }

    private static void appendString(StringBuilder json, String value) {
        json.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> json.append("\\\"");
                case '\\' -> json.append("\\\\");
                case '\n' -> json.append("\\n");
                case '\r' -> json.append("\\r");
                case '\t' -> json.append("\\t");
                default -> {
                    if (c < 0x20) {
                        json.append(String.format("\\u%04x", (int) c));
                    } else {
                        json.append(c);
                    }
                }
            }
        }
        json.append('"');
    }
}
