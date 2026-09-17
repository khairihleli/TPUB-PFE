package com.example.tpubpfe.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "ai_content_checks")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiContentCheck {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "media_id")
    private MediaFile media;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_type", nullable = false, length = 20)
    private AiContentType contentType;

    @Column(name = "risk_score", nullable = false)
    @Builder.Default
    private Short riskScore = 0;

    @Column(name = "quality_score", nullable = false)
    @Builder.Default
    private Short qualityScore = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "detected_issues", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> detectedIssues = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_status", nullable = false, length = 20)
    private AiCheckStatus aiStatus;

    @Column(name = "ai_reason", columnDefinition = "TEXT")
    private String aiReason;

    @Column(columnDefinition = "TEXT")
    private String recommendation;

    @Enumerated(EnumType.STRING)
    @Column(name = "admin_decision", length = 20)
    private AiAdminDecision adminDecision;

    @Column(name = "extracted_text", columnDefinition = "TEXT")
    private String extractedText;

    @Enumerated(EnumType.STRING)
    @Column(name = "ocr_engine", nullable = false, length = 20)
    @Builder.Default
    private OcrEngine ocrEngine = OcrEngine.AUCUN;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private AiSector sector;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> recommendations = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<AiIssue> issues = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "media_analyses", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<AiMediaAnalysis> mediaAnalyses = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "matched_rules", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<AiMatchedRule> matchedRules = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private AiEngine engine = AiEngine.LOCAL;

    @Column(name = "is_preview", nullable = false)
    @Builder.Default
    private Boolean isPreview = false;

    @Column(name = "checked_at", nullable = false)
    @Builder.Default
    private Instant checkedAt = Instant.now();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
