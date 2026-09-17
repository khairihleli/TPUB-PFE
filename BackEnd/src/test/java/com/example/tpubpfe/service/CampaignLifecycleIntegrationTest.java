package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.AiDashboardResponse;
import com.example.tpubpfe.dto.AiDecisionLogResponse;
import com.example.tpubpfe.dto.AiReportResponse;
import com.example.tpubpfe.dto.CampaignRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.CampaignZoneRequest;
import com.example.tpubpfe.dto.CampaignZonesUpdateResponse;
import com.example.tpubpfe.dto.DuplicateRequest;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AiIssueSource;
import com.example.tpubpfe.model.AiModerationRule;
import com.example.tpubpfe.model.AiModerationSeverity;
import com.example.tpubpfe.model.AiRuleType;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.AiModerationRuleRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end lifecycle on H2: create → zones → submit (AI) → search → validate with override → decisions,
 * dashboard, duplication. Also checks the JSON columns round-trip.
 */
@SpringBootTest
@ActiveProfiles("test")
class CampaignLifecycleIntegrationTest {

    @Autowired private CampaignService campaignService;
    @Autowired private CampaignZoneService campaignZoneService;
    @Autowired private CampaignDuplicationService duplicationService;
    @Autowired private AdminCampaignService adminCampaignService;
    @Autowired private AiVerificationService aiVerificationService;
    @Autowired private AiDecisionQueryService decisionQueryService;
    @Autowired private AiDashboardService dashboardService;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ClientRepository clientRepository;
    @Autowired private ZoneRepository zoneRepository;
    @Autowired private DiffusionSupportRepository supportRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private CampaignRepository campaignRepository;
    @Autowired private AiModerationRuleRepository ruleRepository;
    @Autowired private PaymentSimulationRepository paymentRepository;
    @Autowired private JsonMapper jsonMapper;
    @Autowired private Clock clock;

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    @Test
    void fullLifecycleWithOverride() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        LocalDate today = LocalDate.now(clock);
        User advertiser = userRepository.save(User.builder().email("annonceur-" + suffix + "@tpub.test")
                .passwordHash("x").role(role(RoleCode.ANNONCEUR)).nom("Sami " + suffix).isActive(true).build());
        Client client = clientRepository.save(Client.builder().user(advertiser).companyName("Boutique " + suffix)
                .validationStatus(ClientValidationStatus.VALIDATED).build());
        User admin = userRepository.save(User.builder().email("admin-" + suffix + "@tpub.test")
                .passwordHash("x").role(role(RoleCode.ADMINISTRATEUR)).nom("Admin " + suffix).isActive(true).build());
        Zone zone = zoneRepository.save(Zone.builder().name("Zone " + suffix).latitude(new BigDecimal("36.8008000"))
                .longitude(new BigDecimal("10.1800000")).radiusKm(new BigDecimal("5.000")).isActive(true).build());
        DiffusionSupport support = supportRepository.save(DiffusionSupport.builder().zone(zone).name("Écran " + suffix)
                .supportType(SupportType.ECRAN).latitude(new BigDecimal("36.8010000")).longitude(new BigDecimal("10.1810000"))
                .build());
        ruleRepository.save(AiModerationRule.builder().ruleName("jeux-" + suffix).ruleType(AiRuleType.KEYWORD)
                .pattern("jackpot" + suffix.replaceAll("[^a-z]", "")).severity(AiModerationSeverity.HIGH).isActive(true)
                .description("Jeux d'argent").build());
        String trigger = "jackpot" + suffix.replaceAll("[^a-z]", "");

        // 1. create
        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        CampaignResponse created = campaignService.create(CampaignRequest.builder()
                .name("Soirée " + suffix)
                .objective("Grande soirée de lancement avec " + trigger + " et animations pour toute la famille.")
                .budget(new BigDecimal("300.00"))
                .startDate(today.plusDays(1)).endDate(today.plusDays(10))
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(22, 0))
                .build());
        assertThat(created.getStatus()).isEqualTo("BROUILLON");
        assertThat(created.isSubmittable()).isTrue();
        Long campaignId = created.getId();

        // incomplete submit
        assertThatThrownBy(() -> campaignService.submit(campaignId))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUBMIT_INCOMPLETE");

        // 2. zones + a temporary reservation
        CampaignZonesUpdateResponse zones = campaignZoneService.setZones(campaignId, CampaignZoneRequest.builder()
                .zones(List.of(CampaignZoneRequest.ZoneInput.builder().latitude(new BigDecimal("36.8008"))
                        .longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("1.5")).label("Centre").build()))
                .build());
        assertThat(zones.getZones()).singleElement().satisfies(z -> {
            assertThat(z.getZoneId()).isEqualTo(zone.getId());
            assertThat(z.getSupportsInside()).isGreaterThanOrEqualTo(1);
        });
        Campaign entity = campaignRepository.findById(campaignId).orElseThrow();
        reservationRepository.save(Reservation.builder().campaign(entity).zone(zone).support(support)
                .startDate(today.plusDays(1)).endDate(today.plusDays(5))
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0))
                .reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(1200L).estimatedCost(new BigDecimal("9.60")).build());

        // preview does not change the status
        AiReportResponse preview = aiVerificationService.checkContent(campaignId);
        assertThat(preview.isPreview()).isTrue();
        assertThat(preview.getReason()).startsWith("Pré-analyse : ");
        assertThat(campaignService.getById(campaignId).getStatus()).isEqualTo("BROUILLON");

        // 3. submit → AI in the same call
        CampaignResponse submitted = campaignService.submit(campaignId);
        assertThat(submitted.getStatus()).isEqualTo("REVIEW_REQUIRED");
        assertThat(submitted.getAiStatus()).isEqualTo("REVIEW_REQUIRED");
        assertThat(submitted.getAiRiskScore()).isEqualTo(55);
        assertThat(submitted.getEstimatedCost()).isEqualByComparingTo("9.60");
        assertThat(submitted.getReservationsCount()).isEqualTo(1);

        AiReportResponse report = aiVerificationService.getReport(campaignId);
        assertThat(report.isPreview()).isFalse();
        assertThat(report.getAiStatus()).isEqualTo("review_required");
        assertThat(report.getMatchedRules()).singleElement()
                .satisfies(rule -> assertThat(rule.getSeverity()).isEqualTo(AiModerationSeverity.HIGH));
        assertThat(report.getIssues()).anySatisfy(issue -> assertThat(issue.getSource()).isEqualTo(AiIssueSource.REGLE));
        assertThat(report.getRecommendation()).isEqualTo("Vérification manuelle avant diffusion");
        assertThat(report.getAdminDecision()).isEqualTo("PENDING");
        assertThat(aiVerificationService.getChecks(campaignId)).hasSize(2);
        assertThat(aiVerificationService.getIssues(campaignId).getIssues()).isNotEmpty();

        // 4. staff search
        TestAuth.login(admin.getId(), "ADMINISTRATEUR");
        PageResponse<CampaignResponse> found = campaignService.search(new CampaignSearchSpecifications.Filter(
                suffix, "boutique " + suffix, null, zone.getId(), List.of(CampaignStatus.REVIEW_REQUIRED),
                List.of(CampaignAiStatus.REVIEW_REQUIRED), today, today.plusDays(2), List.of(SupportType.ECRAN)), 0, 20, "name,asc");
        assertThat(found.getItems()).extracting(CampaignResponse::getId).containsExactly(campaignId);
        assertThat(found.getTotalItems()).isEqualTo(1);
        PageResponse<CampaignResponse> none = campaignService.search(new CampaignSearchSpecifications.Filter(
                suffix, null, null, null, List.of(CampaignStatus.ACTIVE), List.of(), null, null,
                List.of(SupportType.SITE_WEB)), 0, 20, null);
        assertThat(none.getItems()).isEmpty();

        // 5. validation needs the override
        assertThatThrownBy(() -> adminCampaignService.validate(campaignId, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("AI_OVERRIDE_REQUIRED");
        CampaignResponse validated = adminCampaignService.validate(campaignId,
                AdminValidateRequest.builder().overrideAi(true).comment("Événement vérifié").priorityScore(6).build());
        assertThat(validated.getStatus()).isEqualTo("VALIDATED_BY_ADMIN");
        assertThat(validated.isAiOverride()).isTrue();
        assertThat(validated.getPriorityScore()).isEqualTo((short) 6);
        assertThat(reservationRepository.findByCampaignId(campaignId))
                .extracting(Reservation::getReservationStatus).containsOnly(ReservationStatus.CONFIRMEE);
        assertThat(paymentRepository.findByCampaignId(campaignId)).singleElement()
                .extracting(PaymentSimulation::getAmount).satisfies(amount -> assertThat(amount).isEqualByComparingTo("9.60"));

        PageResponse<AiDecisionLogResponse> decisions = decisionQueryService.search(
                new AiDecisionQueryService.Filter(campaignId, null, null, today, today), 0, 20);
        assertThat(decisions.getItems()).extracting(AiDecisionLogResponse::getDecision)
                .containsExactly("VALIDATED_OVERRIDE", "REVIEW_REQUIRED", "REVIEW_REQUIRED");
        assertThat(decisions.getItems().get(0).getDecidedByName()).isEqualTo("Admin " + suffix);
        assertThat(decisions.getItems().get(2).isPreview()).isTrue();

        AiDashboardResponse dashboard = dashboardService.dashboard();
        assertThat(dashboard.getOverrideCount()).isGreaterThanOrEqualTo(1);
        assertThat(dashboard.getDisagreementCount()).isGreaterThanOrEqualTo(1);
        assertThat(dashboard.getTotalChecks()).isGreaterThanOrEqualTo(1);

        // 6. rejection of a programmed campaign blocks it; the owner can reopen and duplicate
        adminCampaignService.reject(campaignId, "Autorisation de l'événement manquante");
        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        CampaignResponse blocked = campaignService.getById(campaignId);
        assertThat(blocked.getStatus()).isEqualTo("BLOCKED");
        assertThat(blocked.isEditable()).isTrue();
        assertThat(blocked.getRejectionReason()).isEqualTo("Autorisation de l'événement manquante");

        CampaignResponse copy = duplicationService.duplicate(campaignId, DuplicateRequest.builder().includeMedia(true).build());
        assertThat(copy.getStatus()).isEqualTo("BROUILLON");
        assertThat(copy.getName()).isEqualTo("Copie de Soirée " + suffix);
        assertThat(copy.getDuplicatedFromId()).isEqualTo(campaignId);
        assertThat(copy.getStartDate()).isEqualTo(today.plusDays(1));
        assertThat(copy.getZones()).hasSize(1);
        assertThat(copy.getReservationsCount()).isZero();

        assertThat(campaignService.getMine(CampaignSearchSpecifications.Filter.empty()))
                .extracting(CampaignResponse::getId).containsExactly(copy.getId(), campaignId);

        CampaignResponse reopened = campaignService.reopen(campaignId);
        assertThat(reopened.getStatus()).isEqualTo("BROUILLON");
        campaignService.delete(copy.getId());
        assertThat(campaignRepository.findById(copy.getId())).isEmpty();
    }

    @Test
    void campaignTimesAcceptShortFormatAndAreWrittenWithSeconds() throws Exception {
        CampaignRequest request = jsonMapper.readValue(
                "{\"name\":\"x\",\"budget\":10,\"startTime\":\"08:00\",\"endTime\":\"21:30:15\"}", CampaignRequest.class);
        assertThat(request.getStartTime()).isEqualTo(LocalTime.of(8, 0));
        assertThat(request.getEndTime()).isEqualTo(LocalTime.of(21, 30, 15));

        String json = jsonMapper.writeValueAsString(CampaignResponse.builder()
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(22, 0)).build());
        assertThat(json).contains("\"startTime\":\"08:00:00\"").contains("\"endTime\":\"22:00:00\"");
    }

    private Role role(RoleCode code) {
        return roleRepository.findByCode(code).orElseGet(() -> roleRepository.save(
                Role.builder().code(code).name(code.name()).build()));
    }
}
