package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AiIssuesResponse;
import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AiAdminDecision;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.AiModerationRuleRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.service.ai.AiAnalysisResult;
import com.example.tpubpfe.service.ai.ContentAnalysisPipeline;
import com.example.tpubpfe.service.ai.MediaInput;
import com.example.tpubpfe.service.ai.OpenAiAnalysisClient;
import com.example.tpubpfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
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
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiVerificationService {

    static final String PREVIEW_PREFIX = "Pré-analyse : ";
    private static final Set<CampaignStatus> ADMIN_RERUN = EnumSet.of(
            CampaignStatus.PENDING_AI_CHECK, CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED);

    private final AiContentCheckRepository aiContentCheckRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final AiModerationRuleRepository aiModerationRuleRepository;
    private final CampaignRepository campaignRepository;
    private final MediaFileRepository mediaFileRepository;
    private final CampaignAccessGuard accessGuard;
    private final ContentAnalysisPipeline pipeline;
    private final OpenAiAnalysisClient openAiAnalysisClient;
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
     * Runs the pipeline, stores the check and the AI decision log. When {@code preview} is false the result is
     * applied to the campaign (status + aiStatus).
     */
    @Transactional
    public AiContentCheck runCheck(Campaign campaign, boolean preview) {
        List<MediaFile> mediaFiles = mediaFileRepository.findByCampaignId(campaign.getId()).stream()
                .sorted(Comparator.comparing(MediaFile::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        List<MediaInput> media = mediaFiles.stream().map(this::toMediaInput).toList();

        ContentAnalysisPipeline.AnalysisInput input = new ContentAnalysisPipeline.AnalysisInput(
                campaign.getName(), campaign.getObjective(), campaign.getBudget(), media,
                aiModerationRuleRepository.findByIsActiveTrue(), findDuplicates(campaign, mediaFiles));
        ContentAnalysisPipeline.AnalysisOutcome outcome = pipeline.analyze(input);

        if (openAiAnalysisClient.isConfigured()) {
            try {
                AiAnalysisResult openAi = openAiAnalysisClient.analyze(campaign, outcome);
                outcome = pipeline.mergeOpenAi(outcome, openAi);
            } catch (RuntimeException ex) {
                log.warn("OpenAI indisponible pour la campagne {} : {}", campaign.getId(), ex.getMessage());
                outcome = pipeline.withFallbackReason(outcome, "OpenAI indisponible — analyse locale appliquée");
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
                .mediaAnalyses(check.getMediaAnalyses() == null ? List.of() : check.getMediaAnalyses())
                .matchedRules(check.getMatchedRules() == null ? List.of() : check.getMatchedRules())
                .preview(Boolean.TRUE.equals(check.getIsPreview()))
                .adminDecision(check.getAdminDecision() != null ? check.getAdminDecision().name() : null)
                .checkedAt(check.getCheckedAt())
                .build();
    }

    MediaInput toMediaInput(MediaFile media) {
        Path path = resolveQuietly(media.getFilePath());
        Integer width = null;
        Integer height = null;
        boolean image = media.getFileType() != null && media.getFileType() != com.example.tpubpfe.model.MediaFileType.VIDEO;
        if (image && path != null) {
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

    private static Map<String, Object> details(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            map.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        }
        return map;
    }
}
