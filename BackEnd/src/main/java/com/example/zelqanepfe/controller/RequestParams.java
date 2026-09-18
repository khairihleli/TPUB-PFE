package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.service.CampaignErrors;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;

/**
 * Query-string parsing helpers shared by lane B controllers.
 */
final class RequestParams {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm[:ss]");

    private RequestParams() {
    }

    /** Comma-separated ids; null/blank gives an empty list. */
    static List<Long> longs(String raw, String parameter) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            return Arrays.stream(raw.split(","))
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .map(Long::valueOf)
                    .distinct()
                    .toList();
        } catch (NumberFormatException ex) {
            throw CampaignErrors.invalidParameter(parameter, "Valeur invalide pour " + parameter + " : " + raw);
        }
    }

    /** {@code HH:mm} or {@code HH:mm:ss}; null/blank gives null. */
    static LocalTime time(String raw, String parameter) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(raw.trim(), TIME);
        } catch (DateTimeParseException ex) {
            throw CampaignErrors.invalidParameter(parameter, "Heure invalide pour " + parameter + " : utilisez HH:mm ou HH:mm:ss.");
        }
    }
}
