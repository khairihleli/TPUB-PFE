package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Effective analysis engines (docs/round2-contract.md §2.7). Never carries a key. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiProvidersResponse {
    /** LOCAL, OPENAI or ANTHROPIC, as configured. */
    private String provider;
    private boolean configured;
    private String model;
    private Ocr ocr;
    private Video video;
    private Learning learning;

    public record Ocr(String engine, String languages, boolean tessdataPresent, String reason) {
    }

    public record Video(boolean mp4, boolean webm) {
    }

    public record Learning(boolean enabled, boolean autoApply, String cron) {
    }
}
