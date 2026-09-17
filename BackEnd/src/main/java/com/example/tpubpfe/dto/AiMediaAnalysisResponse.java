package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.AiMediaAnalysis;
import com.example.tpubpfe.service.storage.FileStorageService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@code AiMediaAnalysisV2} (docs/round2-contract.md §2.4): the stored analysis with {@code thumbnailPath} replaced
 * by a URL built through {@link FileStorageService#publicUrl(String)}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiMediaAnalysisResponse {
    private Long mediaId;
    private String fileName;
    private String contentType;
    private Integer widthPx;
    private Integer heightPx;
    private Integer durationSeconds;
    private String extractedText;
    private List<String> issues;
    private String ocrEngine;
    private Double ocrConfidence;
    private AiMediaAnalysis.ImageMetrics metrics;
    private List<AiMediaAnalysis.Frame> frames;
    private String thumbnailUrl;
    private Boolean videoSupported;
    private Integer containerDurationSeconds;

    public static AiMediaAnalysisResponse from(AiMediaAnalysis analysis, FileStorageService storage) {
        String thumbnail = analysis.getThumbnailPath();
        return AiMediaAnalysisResponse.builder()
                .mediaId(analysis.getMediaId())
                .fileName(analysis.getFileName())
                .contentType(analysis.getContentType() != null ? analysis.getContentType().name() : null)
                .widthPx(analysis.getWidthPx())
                .heightPx(analysis.getHeightPx())
                .durationSeconds(analysis.getDurationSeconds())
                .extractedText(analysis.getExtractedText())
                .issues(analysis.getIssues() == null ? List.of() : analysis.getIssues())
                .ocrEngine(analysis.getOcrEngine() != null ? analysis.getOcrEngine().name() : "AUCUN")
                .ocrConfidence(analysis.getOcrConfidence())
                .metrics(analysis.getMetrics())
                .frames(analysis.getFrames() == null ? List.of() : analysis.getFrames())
                .thumbnailUrl(thumbnail == null || thumbnail.isBlank() ? null : storage.publicUrl(thumbnail))
                .videoSupported(analysis.getVideoSupported())
                .containerDurationSeconds(analysis.getContainerDurationSeconds())
                .build();
    }
}
