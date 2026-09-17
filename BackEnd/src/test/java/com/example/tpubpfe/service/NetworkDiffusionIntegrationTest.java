package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminValidateRequest;
import com.example.tpubpfe.dto.AvailabilityResponse;
import com.example.tpubpfe.dto.CampaignEstimateResponse;
import com.example.tpubpfe.dto.CampaignRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.CampaignZoneRequest;
import com.example.tpubpfe.dto.DashboardResponse;
import com.example.tpubpfe.dto.DiffusionLogResponse;
import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.dto.EmergencyRequest;
import com.example.tpubpfe.dto.EmergencyResponse;
import com.example.tpubpfe.dto.InteractionRequest;
import com.example.tpubpfe.dto.MediaFileResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.ReservationBatchRequest;
import com.example.tpubpfe.dto.ReservationConflictResponse;
import com.example.tpubpfe.dto.ReservationResponse;
import com.example.tpubpfe.dto.StatisticsCampaignResponse;
import com.example.tpubpfe.dto.StatisticsHistoryResponse;
import com.example.tpubpfe.dto.StatisticsMineResponse;
import com.example.tpubpfe.dto.StatisticsViewsResponse;
import com.example.tpubpfe.dto.SupportBlockRequest;
import com.example.tpubpfe.dto.ZoneRecommendationResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.InteractionType;
import com.example.tpubpfe.model.PaymentSimulation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Lane B end-to-end on H2: media → availability → batch reservations (time-of-day conflicts) → submit → validate →
 * diffusion engine (ad, default, emergency) → interactions → logs → statistics, CSV, history → blocks, zone guard.
 */
@SpringBootTest
@ActiveProfiles("test")
class NetworkDiffusionIntegrationTest {

    @Autowired private CampaignService campaignService;
    @Autowired private CampaignZoneService campaignZoneService;
    @Autowired private AdminCampaignService adminCampaignService;
    @Autowired private MediaService mediaService;
    @Autowired private AvailabilityService availabilityService;
    @Autowired private ZoneRecommendationService zoneRecommendationService;
    @Autowired private ReservationService reservationService;
    @Autowired private EstimationService estimationService;
    @Autowired private DiffusionService diffusionService;
    @Autowired private InteractionService interactionService;
    @Autowired private DiffusionLogQueryService diffusionLogQueryService;
    @Autowired private StatisticsService statisticsService;
    @Autowired private CsvExportService csvExportService;
    @Autowired private EmergencyService emergencyService;
    @Autowired private SupportBlockService supportBlockService;
    @Autowired private ZoneService zoneService;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ClientRepository clientRepository;
    @Autowired private ZoneRepository zoneRepository;
    @Autowired private DiffusionSupportRepository supportRepository;
    @Autowired private CampaignRepository campaignRepository;
    @Autowired private PaymentSimulationRepository paymentRepository;
    @Autowired private Clock clock;

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    @Test
    void reservationsDiffusionAndStatistics() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        LocalDate today = LocalDate.now(clock);
        LocalDate start = today.plusDays(1);
        LocalDate end = today.plusDays(5);
        User advertiser = user("annonceur-b-" + suffix, RoleCode.ANNONCEUR);
        User competitor = user("concurrent-b-" + suffix, RoleCode.ANNONCEUR);
        User admin = user("admin-b-" + suffix, RoleCode.ADMINISTRATEUR);
        client(advertiser, "Pizzeria " + suffix);
        client(competitor, "Concurrent " + suffix);
        Zone zone = zoneRepository.save(Zone.builder().name("Zone B " + suffix).latitude(new BigDecimal("35.8250000"))
                .longitude(new BigDecimal("10.6350000")).radiusKm(new BigDecimal("4.000")).isActive(true).build());
        DiffusionSupport screen = supportRepository.save(DiffusionSupport.builder().zone(zone).name("Écran A " + suffix)
                .supportType(SupportType.ECRAN).latitude(new BigDecimal("35.8255000")).longitude(new BigDecimal("10.6355000"))
                .visibilityScore(new BigDecimal("50")).build());
        DiffusionSupport panel = supportRepository.save(DiffusionSupport.builder().zone(zone).name("Panneau B " + suffix)
                .supportType(SupportType.PANNEAU_NUMERIQUE).latitude(new BigDecimal("35.8262000"))
                .longitude(new BigDecimal("10.6348000")).build());
        LocalTime evening = LocalTime.of(18, 0);
        LocalTime late = LocalTime.of(22, 0);

        // --- advertiser: campaign, zone, media, availability, recommendations, batch reservation ---------------------
        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        Long campaignId = createCampaign("Pizza du soir " + suffix, start, end);
        setCircle(campaignId);
        byte[] png = png();
        MediaFileResponse media = mediaService.upload(campaignId,
                new MockMultipartFile("file", "pizza-margherita.png", "image/png", png), null, null);
        assertThat(media.getWidthPx()).isEqualTo(320);
        assertThat(mediaService.list(campaignId)).extracting(MediaFileResponse::getId).containsExactly(media.getId());

        AvailabilityResponse availability = availabilityService.search(new AvailabilityService.Query(start, end, evening, late,
                campaignId, null, null, null, null, List.of(), List.of()));
        assertThat(availability.getSummary().getTotalSupports()).isEqualTo(2);
        assertThat(availability.getSummary().getAvailableSupports()).isEqualTo(2);
        assertThat(availability.getSupports()).extracting(i -> i.getSupport().getId()).containsExactly(screen.getId(), panel.getId());
        // 120 × (0.5 + 0.5) × 4 h × 5 days = 2400 views
        assertThat(availability.getSupports().get(0).getEstimatedViews()).isEqualTo(2400);
        assertThat(availability.getAlternatives()).isEmpty();

        List<ZoneRecommendationResponse> recommendations = zoneRecommendationService.recommend(start, end, evening, late,
                List.of(), 10);
        assertThat(recommendations).anySatisfy(r -> {
            assertThat(r.getZone().getId()).isEqualTo(zone.getId());
            assertThat(r.getAvailableSupports()).isEqualTo(2);
            assertThat(r.getReasons()).contains("2 Porteurs disponibles sur 2");
        });

        List<ReservationResponse> booked = reservationService.createBatch(ReservationBatchRequest.builder()
                .campaignId(campaignId).supportIds(List.of(screen.getId(), panel.getId()))
                .startTime(evening).endTime(late).build());
        assertThat(booked).hasSize(2).allSatisfy(r -> {
            assertThat(r.getReservationStatus()).isEqualTo("TEMPORAIRE");
            assertThat(r.isCancellable()).isTrue();
        });
        assertThat(booked.get(0).getEstimatedCost()).isEqualByComparingTo("19.20");
        assertThatThrownBy(() -> reservationService.createBatch(ReservationBatchRequest.builder()
                .campaignId(campaignId).supportIds(List.of(screen.getId())).startTime(LocalTime.of(20, 0)).endTime(late).build()))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getCode()).isEqualTo("BATCH_CONFLICT");
                    assertThat(ex.getErrors()).containsEntry(String.valueOf(screen.getId()), "RESERVATION_DUPLICATE");
                });
        ReservationResponse cancelled = reservationService.cancel(booked.get(1).getId(), "Budget recentré");
        assertThat(cancelled.getReservationStatus()).isEqualTo("ANNULEE");
        assertThat(cancelled.getCancelReason()).isEqualTo("Budget recentré");
        CampaignEstimateResponse estimate = estimationService.campaign(campaignId);
        assertThat(estimate.getLines()).hasSize(1);
        assertThat(estimate.getTotalViews()).isEqualTo(2400);
        assertThat(estimate.isBudgetSufficient()).isTrue();
        assertThat(campaignService.getById(campaignId).getEstimatedViews()).isEqualTo(2400);

        // --- competitor: same evening is taken, the morning is free (time-of-day overlap) --------------------------
        TestAuth.login(competitor.getId(), "ANNONCEUR");
        Long rivalId = createCampaign("Burger " + suffix, start, end);
        setCircle(rivalId);
        assertThatThrownBy(() -> reservationService.createBatch(ReservationBatchRequest.builder()
                .campaignId(rivalId).supportIds(List.of(screen.getId(), panel.getId())).startTime(evening).endTime(late).build()))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getErrors()).containsEntry(String.valueOf(screen.getId()), "SUPPORT_ALREADY_RESERVED");
                    assertThat(ex.getErrors()).doesNotContainKey(String.valueOf(panel.getId()));
                });
        assertThat(reservationService.getMine(List.of(), rivalId)).isEmpty();
        AvailabilityResponse rivalView = availabilityService.search(new AvailabilityService.Query(start, end, evening, late,
                null, null, null, null, zone.getId(), List.of(SupportType.ECRAN), List.of()));
        assertThat(rivalView.getSupports()).singleElement().satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo("RESERVE");
            assertThat(item.getConflicts()).singleElement().satisfies(slot -> assertThat(slot.getKind()).isEqualTo("RESERVATION"));
        });
        assertThat(rivalView.getAlternatives()).isNotEmpty().first().satisfies(alt -> {
            assertThat(alt.getAvailableSupports()).isEqualTo(1);
            assertThat(alt.getPreset()).isIn("MATIN", "APRES_MIDI");
        });
        ReservationResponse morning = reservationService.create(com.example.tpubpfe.dto.ReservationRequest.builder()
                .campaignId(rivalId).supportId(screen.getId()).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(12, 0)).build());
        assertThat(morning.getZoneId()).isEqualTo(zone.getId());

        // --- submit, validate --------------------------------------------------------------------------------------
        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        CampaignResponse submitted = campaignService.submit(campaignId);
        assertThat(submitted.getStatus()).isIn("APPROVED_BY_AI", "REVIEW_REQUIRED");
        TestAuth.login(admin.getId(), "ADMINISTRATEUR");
        adminCampaignService.validate(campaignId, AdminValidateRequest.builder()
                .overrideAi("REVIEW_REQUIRED".equals(submitted.getStatus())).priorityScore(5).build());
        List<ReservationConflictResponse> conflicts = reservationService.conflicts(today, end, zone.getId(), null);
        assertThat(conflicts).isEmpty();

        // --- diffusion engine ----------------------------------------------------------------------------------------
        DiffusionResponse ad = diffusionService.getNextAd(screen.getId(), zone.getName(), start.atTime(19, 0));
        assertThat(ad.getType()).isEqualTo("publicite");
        assertThat(ad.getCampaignId()).isEqualTo(campaignId);
        assertThat(ad.getMediaUrl()).isEqualTo(media.getUrl());
        assertThat(ad.getMediaType()).isEqualTo("IMAGE");
        assertThat(ad.getDuration()).isEqualTo(10);
        Campaign afterAd = campaignRepository.findById(campaignId).orElseThrow();
        assertThat(afterAd.getConsumedBudget()).isEqualByComparingTo("0.0080");
        assertThat(paymentRepository.findByCampaignId(campaignId)).singleElement()
                .extracting(PaymentSimulation::getBudgetConsumed).satisfies(v -> assertThat(v).isEqualByComparingTo("0.0080"));

        DiffusionResponse morningDefault = diffusionService.getNextAd(screen.getId(), null, start.atTime(10, 0));
        assertThat(morningDefault.getType()).isEqualTo("defaut");
        DiffusionResponse cancelledSupport = diffusionService.getNextAd(panel.getId(), null, start.atTime(19, 0));
        assertThat(cancelledSupport.getType()).isEqualTo("defaut");

        interactionService.record(new InteractionRequest(ad.getDiffusionLogId(), InteractionType.CLIC));
        interactionService.record(new InteractionRequest(ad.getDiffusionLogId(), InteractionType.CLIC));
        assertThatThrownBy(() -> interactionService.record(new InteractionRequest(morningDefault.getDiffusionLogId(), InteractionType.CLIC)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INTERACTION_NOT_ALLOWED");

        PageResponse<DiffusionLogResponse> logs = diffusionLogQueryService.search(new DiffusionLogQueryService.Filter(
                screen.getId(), null, null, List.of(), start, start), 0, 20);
        assertThat(logs.getItems()).hasSize(2);
        assertThat(logs.getItems().get(0).getContentType()).isEqualTo("PUBLICITE");
        assertThat(logs.getItems().get(0).getClicks()).isEqualTo(1);
        assertThat(logs.getItems().get(0).getCost()).isEqualByComparingTo("0.0080");

        // --- emergency takeover ---------------------------------------------------------------------------------------
        EmergencyResponse alert = emergencyService.create(EmergencyRequest.builder().title("Alerte " + suffix)
                .content("Évitez le centre-ville").latitude(new BigDecimal("35.8255")).longitude(new BigDecimal("10.6355"))
                .radiusKm(new BigDecimal("0.3")).startDate(start).endDate(start).startTime(LocalTime.of(18, 30))
                .endTime(LocalTime.of(19, 30)).urgencyLevel(UrgencyLevel.CRITICAL).build());
        assertThat(alert.getState()).isEqualTo("PROGRAMME");
        assertThat(alert.getAffectedSupports()).isGreaterThanOrEqualTo(2);
        DiffusionResponse takeover = diffusionService.getNextAd(screen.getId(), null, start.atTime(19, 15));
        assertThat(takeover.getType()).isEqualTo("urgence");
        assertThat(takeover.getContent()).isEqualTo("Évitez le centre-ville");
        assertThat(emergencyService.getAll("PROGRAMME")).anySatisfy(e -> {
            assertThat(e.getId()).isEqualTo(alert.getId());
            assertThat(e.getDiffusionCount()).isEqualTo(1);
        });

        // --- statistics ----------------------------------------------------------------------------------------------
        StatisticsViewsResponse views = statisticsService.views(new StatisticsService.ViewsQuery(today, end, "day",
                campaignId, null, null, List.of()));
        assertThat(views.getRows()).hasSize(6);
        assertThat(views.getTotals().getViews()).isEqualTo(1);
        assertThat(views.getTotals().getClicks()).isEqualTo(1);
        assertThat(views.getRows().get(1).getViews()).isEqualTo(1);
        StatisticsViewsResponse bySupport = statisticsService.views(new StatisticsService.ViewsQuery(today, end, "support",
                null, null, zone.getId(), List.of()));
        assertThat(bySupport.getRows()).singleElement().satisfies(row -> assertThat(row.getKey()).isEqualTo(String.valueOf(screen.getId())));
        DashboardResponse dashboard = statisticsService.getDashboard();
        assertThat(dashboard.getTotalViews()).isGreaterThanOrEqualTo(1);
        assertThat(dashboard.getEmergencyViews()).isGreaterThanOrEqualTo(1);
        assertThat(dashboard.getCancelledReservations()).isGreaterThanOrEqualTo(1);
        assertThat(dashboard.getSimulatedRevenue()).isGreaterThan(BigDecimal.ZERO);
        assertThat(dashboard.getSupportsByStatus()).containsKeys("ACTIF", "INACTIF", "MAINTENANCE", "HORS_LIGNE");

        TestAuth.login(advertiser.getId(), "ANNONCEUR");
        StatisticsMineResponse mine = statisticsService.mine(today, end);
        assertThat(mine.getTotals().getViews()).isEqualTo(1);
        assertThat(mine.getTotals().getClicks()).isEqualTo(1);
        assertThat(mine.getTotals().getConfirmedReservations()).isEqualTo(1);
        assertThat(mine.getStatusCounts()).containsEntry("VALIDATED_BY_ADMIN", 1L);
        assertThat(mine.getByZone()).singleElement().satisfies(z -> assertThat(z.getViews()).isEqualTo(1));
        StatisticsCampaignResponse campaignStats = statisticsService.campaign(campaignId, today, end);
        assertThat(campaignStats.getViews()).isEqualTo(1);
        assertThat(campaignStats.getConsumedBudget()).isEqualByComparingTo("0.0080");
        assertThat(campaignStats.getLastDiffusionAt()).isNotNull();
        String csv = new String(csvExportService.export(new CsvExportService.ExportQuery("mine", today, end, null, null)).content(),
                StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿Date;Affichages").contains("Pizza du soir " + suffix);

        TestAuth.login(admin.getId(), "ADMINISTRATEUR");
        statisticsService.snapshotToday();
        statisticsService.snapshotToday();
        List<StatisticsHistoryResponse> history = statisticsService.history(today, today);
        assertThat(history).singleElement().satisfies(h -> assertThat(h.getTotalCampaigns()).isGreaterThanOrEqualTo(2));

        // --- blocks and zone guard -----------------------------------------------------------------------------------
        supportBlockService.create(panel.getId(), SupportBlockRequest.builder().startDate(start).endDate(start.plusDays(1))
                .startTime(LocalTime.of(20, 0)).endTime(LocalTime.of(21, 0))
                .availabilityStatus(AvailabilityStatus.MAINTENANCE).reason("Entretien").build());
        AvailabilityResponse withBlock = availabilityService.search(new AvailabilityService.Query(start, end, evening, late,
                null, 35.8255, 10.6355, 1.0, null, List.of(SupportType.PANNEAU_NUMERIQUE), List.of()));
        assertThat(withBlock.getSupports()).singleElement().satisfies(item -> assertThat(item.getStatus()).isEqualTo("MAINTENANCE"));
        assertThat(supportBlockService.list(panel.getId(), start, end)).hasSize(2);
        assertThatThrownBy(() -> zoneService.delete(zone.getId()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ZONE_IN_USE");
        PageResponse<ReservationResponse> search = reservationService.search(new ReservationService.Filter(
                List.of(ReservationStatus.CONFIRMEE, ReservationStatus.TEMPORAIRE), null, screen.getId(), null, null, start, end),
                0, 10, "startDate,asc");
        assertThat(search.getItems()).hasSize(2).allSatisfy(r -> assertThat(r.isCancellable()).isTrue());
    }

    private Long createCampaign(String name, LocalDate start, LocalDate end) {
        return campaignService.create(CampaignRequest.builder()
                .name(name)
                .objective("Promotion de nos pizzas artisanales du soir, livrées chaudes dans tout le quartier.")
                .budget(new BigDecimal("500.00"))
                .startDate(start).endDate(end)
                .startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(22, 0))
                .build()).getId();
    }

    private void setCircle(Long campaignId) {
        campaignZoneService.setZones(campaignId, CampaignZoneRequest.builder()
                .zones(List.of(CampaignZoneRequest.ZoneInput.builder().latitude(new BigDecimal("35.8256"))
                        .longitude(new BigDecimal("10.6352")).radiusKm(new BigDecimal("1.0")).label("Centre").build()))
                .build());
    }

    private User user(String prefix, RoleCode role) {
        return userRepository.save(User.builder().email(prefix + "@tpub.test").passwordHash("x")
                .role(roleRepository.findByCode(role).orElseGet(() -> roleRepository.save(
                        Role.builder().code(role).name(role.name()).build())))
                .nom(prefix).isActive(true).build());
    }

    private Client client(User user, String company) {
        return clientRepository.save(Client.builder().user(user).companyName(company)
                .validationStatus(ClientValidationStatus.VALIDATED).build());
    }

    private static byte[] png() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(320, 180, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }
}
