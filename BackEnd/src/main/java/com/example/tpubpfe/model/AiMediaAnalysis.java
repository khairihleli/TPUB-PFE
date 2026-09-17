package com.example.tpubpfe.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/** Per-media analysis (stored as JSON in {@code ai_content_checks.media_analyses}). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiMediaAnalysis {
    private Long mediaId;
    private String fileName;
    private AiContentType contentType;
    private Integer widthPx;
    private Integer heightPx;
    private Integer durationSeconds;
    private String extractedText;
    @Builder.Default
    private List<String> issues = new ArrayList<>();
}
