package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.dto.AiIssuesResponse;
import com.example.zelqanepfe.dto.AiMediaAnalysisResponse;
import com.example.zelqanepfe.dto.AiReportResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.AiAdminDecision;
import com.example.zelqanepfe.model.AiCheckStatus;
import com.example.zelqanepfe.model.AiContentCheck;
import com.example.zelqanepfe.model.AiContentType;
import com.example.zelqanepfe.model.AiDecisionLog;
import com.example.zelqanepfe.model.AiDecisionType;
import com.example.zelqanepfe.model.AiMediaAnalysis;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.MediaFile;
import com.example.zelqanepfe.model.MediaFileType;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.repository.AiContentCheckRepository;
import com.example.zelqanepfe.repository.AiDecisionLogRepository;
import com.example.zelqanepfe.repository.AiModerationRuleRepository;
import com.example.zelqanepfe.repository.CampaignRepository;
import com.example.zelqanepfe.repository.MediaFileRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.ai.ContentAnalysisPipeline;
import com.example.zelqanepfe.service.ai.MediaInput;
import com.example.zelqanepfe.service.ai.learning.AiCalibrationService;
import com.example.zelqanepfe.service.ai.learning.CalibrationSnapshot;
import com.example.zelqanepfe.service.ai.media.JpegEncoder;
import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider;
import com.example.zelqanepfe.service.ai.provider.VisionProviderRegistry;
import com.example.zelqanepfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiVerificationService {

    static final String PREVIEW_PREFIX = "Pré-analyse : ";
    static final int PROVIDER_IMAGE_MAX_SIDE = 1024;
    private static final Set<CampaignStatus> ADMIN_RERUN = EnumSet.of(
            CampaignStatus.PENDING_AI_CHECK, CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED);

    private final AiContentCheckRepository aiContentCheckRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final AiModerationRuleRepository aiModerationRuleRepository;
    private final CampaignRepository campaignRepository;
    private final MediaFileRepository mediaFileRepository;
    private final CampaignAccessGuard accessGuard;
    private final ContentAnalysisPipeline pipeline;
    private final VisionProviderRegistry providerRegistry;
    private final AiCalibrationService calibrationService;
    private final AiAnalysisProperties analysisProperties;
    private final FileStorageService fileStorageService;
    private final AuditService auditService;
    private final Clock clock;

    /**
     * {@code POST /api/ai/check-content/{campaignId}}: preview for a draft, (re)analysis otherwise (§2.2).
     */
    @Transactional
    public AiReportResponse checkContent(Long campaignId) {
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        String role = user != null ? user.getRoleCode() : null;

        if (RoleCode.ANNONCEUR.name().equals(role)) {
            Campaign campaign = accessGuard.owned(campaignId);
            if (campaign.getStatus() == CampaignStatus.BROUILLON) {
                return toReport(runCheck(campaign, true));
            }
            if (campaign.getStatus() == CampaignStatus.PENDING_AI_CHECK) {
                return toReport(runCheck(campaign, false));
            }
            throw CampaignErrors.notEligibleForAi();
        }
        if (RoleCode.ADMINISTRATEUR.name().equals(role)) {
            Campaign campaign = accessGuard.readable(campaignId);
            if (!ADMIN_RERUN.contains(campaign.getStatus())) {
                throw CampaignErrors.notEligibleForAi();
            }
            CampaignStatus before = campaign.getStatus();
            campaign.setAiOverride(false);
            AiContentCheck check = runCheck(campaign, false);
            auditService.record("AI_CHECK_RERUN", "CAMPAIGN", campaign.getId(),
                    "Analyse IA relancée pour la campagne « " + campaign.getName() + " »",
                    details("previousStatus", before.name(), "newStatus", campaign.getStatus().name(),
                            "riskScore", check.getRiskScore(), "qualityScore", check.getQualityScore()));
            return toReport(check);
        }
        throw CampaignErrors.notEligibleForAi();
    }

    /**
     * Runs the pipeline with the active calibration, merges the optional vision provider, stores the check and the
     * AI decision log. When {@code preview} is false the result is applied to the campaign (status + aiStatus).
     */
    @Transactional
    public AiContentCheck runCheck(Campaign campaign, boolean preview) {
        List<MediaFile> mediaFiles = mediaFileRepository.findByCampaignId(campaign.getId()).stream()
                .sorted(Comparator.comparing((MediaFile m) -> m.getSortOrder() == null ? 0 : m.getSortOrder())
                        .thenComparing(MediaFile::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        List<MediaInput> media = mediaFiles.stream().map(this::toMediaInput).toList();
        CalibrationSnapshot calibration = calibrationService.activeSnapshot();

        ContentAnalysisPipeline.AnalysisInput input = new ContentAnalysisPipeline.AnalysisInput(
                campaign.getName(), campaign.getObjective(), campaign.getBudget(), media,
                aiModerationRuleRepository.findByIsActiveTrue(), findDuplicates(campaign, mediaFiles),
                campaign.getId(), calibration);
        ContentAnalysisPipeline.AnalysisOutcome outcome = pipeline.analyze(input);
        writeBackMetadata(mediaFiles, outcome.mediaAnalyses());

        Optional<VisionModerationProvider> provider = providerRegistry.active();
        if (provider.isPresent()) {
            String providerName = ContentAnalysisPipeline.providerName(provider.get().type());
            try {
                VisionModerationProvider.ProviderVerdict verdict = provider.get()
                        .analyze(providerRequest(campaign, outcome, mediaFiles));
                outcome = pipeline.mergeProvider(outcome, verdict, provider.get().type());
            } catch (RuntimeException ex) {
                log.warn("{} indisponible pour la campagne {} : {}", providerName, campaign.getId(), ex.getMessage());
                outcome = pipeline.withFallbackReason(outcome, providerName + " indisponible : analyse locale appliquée");
            }
        }

        Long primaryId = outcome.primaryMediaId();
        MediaFile primary = primaryId == null ? null : mediaFiles.stream()
                .filter(m -> Objects.equals(m.getId(), primaryId))
                .findFirst().orElse(null);
        String reason = preview ? PREVIEW_PREFIX + outcome.reason() : outcome.reason();

        AiContentCheck check = aiContentCheckRepository.save(AiContentCheck.builder()
                .campaign(campaign)
                .media(primary)
                .contentType(outcome.contentType())
                .riskScore((short) outcome.riskScore())
                .qualityScore((short) outcome.qualityScore())
                .detectedIssues(new ArrayList<>(outcome.issueLabels()))
                .issues(new ArrayList<>(outcome.issues()))
                .aiStatus(outcome.status())
                .aiReason(reason)
                .recommendation(outcome.recommendation())
                .recommendations(new ArrayList<>(outcome.recommendations()))
                .sector(outcome.sector())
                .extractedText(outcome.extractedText())
                .ocrEngine(outcome.ocrEngine())
                .mediaAnalyses(new ArrayList<>(outcome.mediaAnalyses()))
                .matchedRules(new ArrayList<>(outcome.matchedRules()))
                .engine(outcome.engine())
                .calibrationVersion(calibration.version())
                .providerModel(truncate(outcome.providerModel(), 100))
                .isPreview(preview)
                .adminDecision(!preview && outcome.status() != AiCheckStatus.REJECTED ? AiAdminDecision.PENDING : null)
                .checkedAt(Instant.now(clock))
                .build());

        if (!preview) {
            campaign.setAiStatus(CampaignLifecycle.aiStatusFor(outcome.status()));
            campaign.setStatus(CampaignLifecycle.statusForAi(outcome.status()));
            campaignRepository.save(campaign);
        }

        aiDecisionLogRepository.save(AiDecisionLog.builder()
                .check(check)
                .campaign(campaign)
                .decisionType(AiDecisionType.AI)
                .decision(outcome.status().name())
                .reason(reason)
                .build());
        return check;
    }

    @Transactional(readOnly = true)
    public AiReportResponse getReport(Long campaignId) {
        accessGuard.readable(campaignId);
        return aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDescIdDesc(campaignId)
                .map(this::toReport)
                .orElseThrow(CampaignErrors::aiReportNotFound);
    }

    @Transactional(readOnly = true)
    public AiIssuesResponse getIssues(Long campaignId) {
        accessGuard.readable(campaignId);
        AiContentCheck check = aiContentCheckRepository.findTopByCampaignIdOrderByCheckedAtDescIdDesc(campaignId)
                .orElseThrow(CampaignErrors::aiReportNotFound);
        return AiIssuesResponse.builder()
                .campaignId(campaignId)
                .checkId(check.getId())
                .aiStatus(check.getAiStatus().name().toLowerCase())
                .issues(check.getIssues() == null ? List.of() : check.getIssues())
                .build();
    }

    @Transactional(readOnly = true)
    public List<AiReportResponse> getChecks(Long campaignId) {
        accessGuard.readable(campaignId);
        return aiContentCheckRepository.findByCampaignIdOrderByCheckedAtDescIdDesc(campaignId).stream()
                .map(this::toReport)
                .toList();
    }

    public AiReportResponse toReport(AiContentCheck check) {
        return AiReportResponse.builder()
                .campaignId(check.getCampaign().getId())
                .checkId(check.getId())
                .aiStatus(check.getAiStatus().name().toLowerCase())
                .riskScore(check.getRiskScore().intValue())
                .qualityScore(check.getQualityScore().intValue())
                .detectedIssues(check.getDetectedIssues() == null ? List.of() : check.getDetectedIssues())
                .issues(check.getIssues() == null ? List.of() : check.getIssues())
                .recommendation(check.getRecommendation())
                .recommendations(check.getRecommendations() == null ? List.of() : check.getRecommendations())
                .reason(check.getAiReason())
                .sector(check.getSector() != null ? check.getSector().name() : null)
                .contentType(check.getContentType() != null ? check.getContentType().name() : null)
                .extractedText(check.getExtractedText())
                .ocrEngine(check.getOcrEngine() != null ? check.getOcrEngine().name() : "AUCUN")
                .engine(check.getEngine() != null ? check.getEngine().name() : "LOCAL")
                .mediaAnalyses(check.getMediaAnalyses() == null ? List.of() : check.getMediaAnalyses().stream()
                        .map(analysis -> AiMediaAnalysisResponse.from(analysis, fileStorageService))
                        .toList())
                .matchedRules(check.getMatchedRules() == null ? List.of() : check.getMatchedRules())
                .providerModel(check.getProviderModel())
                .calibrationVersion(check.getCalibrationVersion())
                .preview(Boolean.TRUE.equals(check.getIsPreview()))
                .adminDecision(check.getAdminDecision() != null ? check.getAdminDecision().name() : null)
                .checkedAt(check.getCheckedAt())
                .build();
    }

    MediaInput toMediaInput(MediaFile media) {
        Path path = resolveQuietly(media.getFilePath());
        Integer width = media.getWidthPx();
        Integer height = media.getHeightPx();
        boolean image = media.getFileType() != null && media.getFileType() != MediaFileType.VIDEO;
        if (image && path != null && (width == null || height == null)) {
            int[] dimensions = readDimensions(path);
            if (dimensions != null) {
                width = dimensions[0];
                height = dimensions[1];
            }
        }
        return new MediaInput(media.getId(), media.getFileName(), media.getFileType(), media.getMimeType(),
                media.getFileSizeBytes(),
                media.getDurationSeconds() != null ? media.getDurationSeconds().intValue() : null,
                width, height, media.getChecksum(), path);
    }

    /**
     * Stores container / decoded values in {@code media_files} where the column is still null (§2.3).
     */
    void writeBackMetadata(List<MediaFile> mediaFiles, List<AiMediaAnalysis> analyses) {
        Map<Long, AiMediaAnalysis> byId = analyses.stream()
                .filter(a -> a.getMediaId() != null)
                .collect(Collectors.toMap(AiMediaAnalysis::getMediaId, Function.identity(), (a, b) -> a));
        for (MediaFile media : mediaFiles) {
            AiMediaAnalysis analysis = byId.get(media.getId());
            if (analysis == null) {
                continue;
            }
            boolean changed = false;
            if (media.getDurationSeconds() == null && analysis.getContainerDurationSeconds() != null
                    && analysis.getContainerDurationSeconds() <= Short.MAX_VALUE) {
                media.setDurationSeconds(analysis.getContainerDurationSeconds().shortValue());
                changed = true;
            }
            if (media.getWidthPx() == null && analysis.getWidthPx() != null) {
                media.setWidthPx(analysis.getWidthPx());
                changed = true;
            }
            if (media.getHeightPx() == null && analysis.getHeightPx() != null) {
                media.setHeightPx(analysis.getHeightPx());
                changed = true;
            }
            if (changed) {
                mediaFileRepository.save(media);
            }
        }
    }

    /** Campaign text, OCR, media summaries and images: IMAGE/BANNER first, then video middle frames (§2.5). */
    VisionModerationProvider.ProviderRequest providerRequest(Campaign campaign, ContentAnalysisPipeline.AnalysisOutcome outcome,
                                                             List<MediaFile> mediaFiles) {
        Map<Long, AiMediaAnalysis> byId = outcome.mediaAnalyses().stream()
                .filter(a -> a.getMediaId() != null)
                .collect(Collectors.toMap(AiMediaAnalysis::getMediaId, Function.identity(), (a, b) -> a));
        int maxImages = Math.max(0, analysisProperties.getProvider().getMaxImages());
        List<VisionModerationProvider.ProviderImage> images = new ArrayList<>();
        for (MediaFile media : mediaFiles) {
            if (images.size() >= maxImages) {
                break;
            }
            if (media.getFileType() != MediaFileType.VIDEO) {
                providerImage(resolveQuietly(media.getFilePath())).ifPresent(images::add);
            }
        }
        for (MediaFile media : mediaFiles) {
            if (images.size() >= maxImages) {
                break;
            }
            AiMediaAnalysis analysis = byId.get(media.getId());
            if (media.getFileType() == MediaFileType.VIDEO && analysis != null && analysis.getThumbnailPath() != null) {
                providerImage(resolveQuietly(analysis.getThumbnailPath())).ifPresent(images::add);
            }
        }
        List<String> summaries = outcome.mediaAnalyses().stream().map(AiVerificationService::mediaSummary).toList();
        return new VisionModerationProvider.ProviderRequest(campaign.getId(), campaign.getName(), campaign.getObjective(),
                campaign.getBudget(), campaign.getStartDate(), campaign.getEndDate(), outcome.extractedText(), summaries,
                images);
    }

    static String mediaSummary(AiMediaAnalysis m) {
        StringBuilder text = new StringBuilder(m.getFileName() == null ? "média" : m.getFileName())
                .append(" (").append(m.getContentType() == AiContentType.VIDEO ? "vidéo" : "image");
        if (m.getWidthPx() != null && m.getHeightPx() != null) {
            text.append(", ").append(m.getWidthPx()).append("×").append(m.getHeightPx()).append(" px");
        }
        Integer duration = m.getContainerDurationSeconds() != null ? m.getContainerDurationSeconds() : m.getDurationSeconds();
        if (duration != null) {
            text.append(", ").append(duration).append(" s");
        }
        if (m.getMetrics() != null) {
            text.append(String.format(Locale.ROOT, ", netteté %.0f, luminosité %.0f, contraste %.0f, texte %.0f %%",
                    m.getMetrics().getSharpness(), m.getMetrics().getBrightness(), m.getMetrics().getContrast(),
                    m.getMetrics().getTextCoverage() * 100));
        }
        return text.append(")").toString();
    }

    private static Optional<VisionModerationProvider.ProviderImage> providerImage(Path path) {
        if (path == null) {
            return Optional.empty();
        }
        try {
            BufferedImage image = ImageIO.read(path.toFile());
            if (image == null) {
                return Optional.empty();
            }
            return Optional.of(new VisionModerationProvider.ProviderImage("image/jpeg",
                    JpegEncoder.encode(JpegEncoder.fitLongestSide(image, PROVIDER_IMAGE_MAX_SIDE))));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    /**
     * Same checksum used by a campaign of another advertiser (a duplicated campaign of the same advertiser is not
     * a suspicious reuse).
     */
    List<ContentAnalysisPipeline.DuplicateHit> findDuplicates(Campaign campaign, List<MediaFile> mediaFiles) {
        Map<String, Long> checksums = new LinkedHashMap<>();
        mediaFiles.stream()
                .filter(m -> m.getChecksum() != null && !m.getChecksum().isBlank())
                .forEach(m -> checksums.putIfAbsent(m.getChecksum(), m.getId()));
        if (checksums.isEmpty()) {
            return List.of();
        }
        Long clientId = campaign.getClient() != null ? campaign.getClient().getId() : null;
        return mediaFileRepository.findAll().stream()
                .filter(other -> other.getChecksum() != null && checksums.containsKey(other.getChecksum()))
                .filter(other -> other.getCampaign() != null
                        && !Objects.equals(other.getCampaign().getId(), campaign.getId()))
                .filter(other -> other.getCampaign().getClient() == null
                        || !Objects.equals(other.getCampaign().getClient().getId(), clientId))
                .map(other -> new ContentAnalysisPipeline.DuplicateHit(
                        checksums.get(other.getChecksum()), other.getCampaign().getId()))
                .collect(Collectors.toList());
    }

    private Path resolveQuietly(String filePath) {
        if (filePath == null || filePath.isBlank() || filePath.startsWith("http://") || filePath.startsWith("https://")) {
            return null;
        }
        try {
            String relative = filePath;
            String baseUrl = fileStorageService.publicUrl("");
            if (baseUrl != null && relative.startsWith(baseUrl)) {
                relative = relative.substring(baseUrl.length());
            }
            Path path = fileStorageService.resolve(relative);
            return Files.isRegularFile(path) ? path : null;
        } catch (ApiException | java.nio.file.InvalidPathException ex) {
            return null;
        }
    }

    private static int[] readDimensions(Path path) {
        try (ImageInputStream in = ImageIO.createImageInputStream(path.toFile())) {
            if (in == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                return new int[]{reader.getWidth(0), reader.getHeight(0)};
            } finally {
                reader.dispose();
            }
        } catch (Exception ex) {
            return null;
        }
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static Map<String, Object> details(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i++) {
            map.put(String.valueOf(keyValues[i]), keyValues[++i]);
        }
        return map;
    }
}
