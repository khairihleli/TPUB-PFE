package com.example.zelqanepfe.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Per-media analysis (stored as JSON in {@code ai_content_checks.media_analyses}). The round-2 fields
 * (docs/round2-contract.md §2.4) are nullable so older rows still deserialise.
 */
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

    private OcrEngine ocrEngine;
    /** Mean word confidence 0..100. */
    private Double ocrConfidence;
    /** Image metrics, or the worst frame for a video. */
    private ImageMetrics metrics;
    @Builder.Default
    private List<Frame> frames = new ArrayList<>();
    /** Relative storage path of the video thumbnail; never serialised to API clients. */
    private String thumbnailPath;
    private Boolean videoSupported;
    private Integer containerDurationSeconds;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImageMetrics {
        private int width;
        private int height;
        private double aspectRatio;
        /** {@code 16:9}, {@code 9:16}, {@code CARRE}, {@code PROCHE} or {@code AUTRE}. */
        private String aspectFit;
        private double sharpness;
        private double brightness;
        private double contrast;
        private double textCoverage;
        @Builder.Default
        private List<DominantColor> dominantColors = new ArrayList<>();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DominantColor {
        private String hex;
        private double share;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Frame {
        /** {@code DEBUT}, {@code MILIEU} or {@code FIN}. */
        private String label;
        private double positionSeconds;
        private String extractedText;
        private ImageMetrics metrics;
    }
}
