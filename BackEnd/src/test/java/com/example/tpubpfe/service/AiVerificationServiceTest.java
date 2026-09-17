package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AiCalibrationResponse;
import com.example.tpubpfe.dto.AiQualityResponse;
import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.dto.CampaignRequest;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AiCheckStatus;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.AiDecisionLog;
import com.example.tpubpfe.model.AiDecisionType;
import com.example.tpubpfe.model.AiFeedbackOutcome;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiRuleType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.AiCalibrationRepository;
import com.example.tpubpfe.repository.AiDecisionLogRepository;
import com.example.tpubpfe.repository.AiFeedbackRepository;
import com.example.tpubpfe.repository.AiModerationRuleRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.model.AiCalibration;
import com.example.tpubpfe.service.ai.AiProvidersService;
import com.example.tpubpfe.service.ai.learning.AiCalibrationService;
import com.example.tpubpfe.service.ai.learning.AiFeedbackService;
import com.example.tpubpfe.service.ai.learning.AiQualityService;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-2 AI flow on H2: calibrated analysis with a real image, metadata write-back, admin feedback, recalibration,
 * activation, quality dashboard and engines status.
 */
@SpringBootTest
@ActiveProfiles("test")
class AiVerificationServiceTest {

    @Autowired private CampaignService campaignService;
    @Autowired private AiVerificationService aiVerificationService;
    @Autowired private AiFeedbackService feedbackService;
    @Autowired private AiCalibrationService calibrationService;
    @Autowired private AiQualityService qualityService;
    @Autowired private AiProvidersService providersService;
    @Autowired private FileStorageService storage;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ClientRepository clientRepository;
    @Autowired private CampaignRepository campaignRepository;
    @Autowired private MediaFileRepository mediaFileRepository;
    @Autowired private AiModerationRuleRepository ruleRepository;
    @Autowired private AiDecisionLogRepository decisionLogRepository;
    @Autowired private AiFeedbackRepository feedbackRepository;
    @Autowired private AiCalibrationRepository calibrationRepository;
    @Autowired private Clock clock;

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    @Test
    void calibratedAnalysisFeedbackAndRecalibration() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String letters = suffix.replaceAll("[^a-z]", "") + "zq";
        LocalDate today = LocalDate.now(clock);
        User advertiser = userRepository.save(User.builder().email("ia-" + suffix + "@tpub.test").passwordHash("x")
                .role(role(RoleCode.ANNONCEUR)).nom("Annonceur " + suffix).isActive(true).build());
        clientRepository.save(Client.builder().user(advertiser).companyName("Société " + suffix)
                .validationStatus(ClientValidationStatus.VALIDATED).build());
        User admin = userRepository.save(User.builder().email("ia-admin-" + suffix + "@tpub.test").passwordHash("x")
                .role(role(RoleCode.ADMINISTRATEUR)).nom("Admin " + suffix).isActive(true).build());
        AiModerationRule rule = ruleRepository.save(AiModerationRule.builder().ruleName("promesse-" + suffix)
                .ruleType(AiRuleType.KEYWORD).pattern("miracle" + letters).severity(AiModerationSeverity.MEDIUM)
                .isActive(true).build());

        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        Long campaignId = campaignService.create(CampaignRequest.builder()
                .name("Offre " + suffix)
                .objective("Découvrez notre offre miracle" + letters + " dans nos boutiques de Tunis, du lundi au samedi.")
                .budget(new BigDecimal("250.00"))
                .startDate(today.plusDays(2)).endDate(today.plusDays(9))
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(20, 0))
                .build()).getId();
        Campaign campaign = campaignRepository.findById(campaignId).orElseThrow();

        String relative = "campaigns/" + campaignId + "/visuel.png";
        Path file = storage.resolve(relative);
        Files.createDirectories(file.getParent());
        BufferedImage image = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 1080; y++) {
            for (int x = 0; x < 1920; x++) {
                image.setRGB(x, y, ((x / 40 + y / 40) % 2 == 0) ? 0xE11D2A : 0xF5F5F5);
            }
        }
        ImageIO.write(image, "png", file.toFile());
        MediaFile media = mediaFileRepository.save(MediaFile.builder().campaign(campaign).fileName("visuel.png")
                .filePath(relative).fileType(MediaFileType.IMAGE).mimeType("image/png")
                .fileSizeBytes(Files.size(file)).build());

        AiContentCheck check = aiVerificationService.runCheck(campaign, false);

        AiCalibration active = calibrationRepository.findFirstByIsActiveTrueOrderByVersionDesc().orElseThrow();
        assertThat(check.getCalibrationVersion()).isEqualTo(active.getVersion());
        assertThat(check.getAiStatus()).isEqualTo(AiCheckStatus.REVIEW_REQUIRED);
        assertThat(check.getProviderModel()).isNull();
        AiReportResponse report = aiVerificationService.toReport(check);
        assertThat(report.getCalibrationVersion()).isEqualTo(active.getVersion());
        assertThat(report.getMediaAnalyses()).singleElement().satisfies(analysis -> {
            assertThat(analysis.getMetrics()).isNotNull();
            assertThat(analysis.getMetrics().getAspectFit()).isEqualTo("16:9");
            assertThat(analysis.getMetrics().getDominantColors()).isNotEmpty();
            assertThat(analysis.getOcrEngine()).isEqualTo("SIMULE");
            assertThat(analysis.getThumbnailUrl()).isNull();
        });
        MediaFile reloaded = mediaFileRepository.findById(media.getId()).orElseThrow();
        assertThat(reloaded.getWidthPx()).isEqualTo(1920);
        assertThat(reloaded.getHeightPx()).isEqualTo(1080);

        // administrator override → exactly one feedback row, however many syncs run
        decisionLogRepository.save(AiDecisionLog.builder().check(check).campaign(campaign)
                .decisionType(AiDecisionType.ADMIN).decision("VALIDATED_OVERRIDE").reason("Vérifié")
                .decidedByUser(admin).build());
        feedbackService.sync();
        feedbackService.sync();
        var rows = feedbackRepository.findAll().stream()
                .filter(f -> f.getCampaign().getId().equals(campaignId)).toList();
        assertThat(rows).singleElement().satisfies(f -> {
            assertThat(f.getOutcome()).isEqualTo(AiFeedbackOutcome.FALSE_POSITIVE);
            assertThat(AiFeedbackService.matchedRuleIds(f)).containsExactly(rule.getId());
            assertThat(f.getCalibrationVersion()).isEqualTo(active.getVersion());
        });

        TestAuth.login(admin.getId(), "ADMINISTRATEUR");
        var page = feedbackService.search(List.of(AiFeedbackOutcome.FALSE_POSITIVE), rule.getId(), today, today, 0, 20);
        assertThat(page.getItems()).singleElement().satisfies(item -> {
            assertThat(item.getCampaignName()).isEqualTo("Offre " + suffix);
            assertThat(item.getAdminDecision()).isEqualTo("VALIDATED_OVERRIDE");
            assertThat(item.getDecidedByName()).isEqualTo("Admin " + suffix);
        });
        assertThatThrownBy(() -> feedbackService.search(List.of(), null, today, today.minusDays(1), 0, 20))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");

        // Too little feedback: the new version keeps the thresholds and is only a proposal
        AiCalibrationResponse proposal = calibrationService.recalibrate(AiCalibration.Trigger.MANUEL);
        assertThat(proposal.getVersion()).isGreaterThan(active.getVersion());
        assertThat(proposal.getTrigger()).isEqualTo("MANUEL");
        assertThat(proposal.getApproveThreshold()).isEqualTo(active.getApproveThreshold().intValue());
        assertThat(proposal.isChanged()).isFalse();
        assertThat(proposal.isActive()).isFalse();
        assertThat(proposal.getCreatedByName()).isEqualTo("Admin " + suffix);
        assertThat(calibrationService.history()).extracting(AiCalibrationResponse::getVersion).first()
                .isEqualTo(proposal.getVersion());

        AiCalibrationResponse activated = calibrationService.activate(proposal.getVersion());
        assertThat(activated.isActive()).isTrue();
        assertThat(calibrationRepository.findByIsActiveTrue()).singleElement()
                .extracting(AiCalibration::getVersion).isEqualTo(proposal.getVersion());
        assertThatThrownBy(() -> calibrationService.activate(99_999))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CALIBRATION_NOT_FOUND");
        calibrationService.activate(active.getVersion());

        AiQualityResponse quality = qualityService.quality(today, today);
        assertThat(quality.getFeedbackCount()).isGreaterThanOrEqualTo(1);
        assertThat(quality.getFalsePositives()).isGreaterThanOrEqualTo(1);
        assertThat(quality.getPerRule()).anySatisfy(r -> {
            assertThat(r.ruleId()).isEqualTo(rule.getId());
            assertThat(r.falsePositives()).isEqualTo(1);
            assertThat(r.precision()).isEqualTo(0.0);
        });
        assertThat(quality.getActiveCalibration().getVersion()).isEqualTo(active.getVersion());
        assertThatThrownBy(() -> qualityService.quality(today.minusDays(400), today))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");

        var providers = providersService.providers();
        assertThat(providers.getProvider()).isEqualTo("LOCAL");
        assertThat(providers.isConfigured()).isTrue();
        assertThat(providers.getOcr().engine()).isEqualTo("SIMULE");
        assertThat(providers.getVideo().mp4()).isTrue();
    }

    private Role role(RoleCode code) {
        return roleRepository.findByCode(code).orElseGet(() -> roleRepository.save(Role.builder().code(code)
                .name(code.name()).build()));
    }
}
