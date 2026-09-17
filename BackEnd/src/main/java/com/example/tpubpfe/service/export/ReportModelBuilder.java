package com.example.tpubpfe.service.export;

import com.example.tpubpfe.dto.DashboardResponse;
import com.example.tpubpfe.dto.StatisticsCampaignResponse;
import com.example.tpubpfe.dto.StatisticsDailyRow;
import com.example.tpubpfe.dto.StatisticsMineResponse;
import com.example.tpubpfe.dto.StatisticsViewsResponse;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.service.NetworkErrors;
import com.example.tpubpfe.service.SecurityUtils;
import com.example.tpubpfe.service.StatisticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Builds the {@link ReportModel} of every export type from the existing statistics responses (§5.6). */
@Service
@RequiredArgsConstructor
public class ReportModelBuilder {

    private static final Set<String> STAFF = Set.of(
            RoleCode.ADMINISTRATEUR.name(), RoleCode.SUPERVISEUR.name(), RoleCode.OPERATEUR.name());

    private final StatisticsService statisticsService;
    private final CampaignRepository campaignRepository;
    private final MediaFileRepository mediaFileRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final Clock clock;

    /** Same query, roles and {@code EXPORT_TYPE_INVALID} as the CSV export. */
    @Transactional(readOnly = true)
    public ReportModel build(String rawType, LocalDate from, LocalDate to, String groupBy, Long campaignId) {
        String type = rawType == null ? "" : rawType.trim().toLowerCase(Locale.ROOT);
        UserDetailsImpl user = SecurityUtils.currentUserOrNull();
        String role = user != null ? user.getRoleCode() : null;
        Instant now = Instant.now(clock);
        return switch (type) {
            case "views" -> {
                requireStaff(role);
                yield views(statisticsService.views(new StatisticsService.ViewsQuery(from, to, groupBy, campaignId,
                        null, null, List.of())), now);
            }
            case "dashboard" -> {
                requireStaff(role);
                LocalDate today = LocalDate.now(clock);
                yield dashboard(statisticsService.getDashboard(), today, now);
            }
            case "mine" -> {
                if (!RoleCode.ANNONCEUR.name().equals(role)) {
                    throw NetworkErrors.accessDenied();
                }
                yield mine(statisticsService.mine(from, to), now);
            }
            case "campaign" -> {
                if (campaignId == null) {
                    throw NetworkErrors.missingParameter("campaignId", "Paramètre obligatoire : campaignId.");
                }
                yield campaign(statisticsService.campaign(campaignId, from, to), now);
            }
            default -> throw NetworkErrors.exportTypeInvalid();
        };
    }

    private static void requireStaff(String role) {
        if (role == null || !STAFF.contains(role)) {
            throw NetworkErrors.accessDenied();
        }
    }

    private ReportModel views(StatisticsViewsResponse views, Instant now) {
        String group = switch (views.getGroupBy()) {
            case "campaign" -> "Campagne";
            case "support" -> "Porteur";
            case "zone" -> "Zone";
            default -> "Date";
        };
        boolean byDay = "day".equals(views.getGroupBy());
        List<List<ReportModel.Cell>> rows = new ArrayList<>();
        for (StatisticsViewsResponse.Row row : views.getRows()) {
            ReportModel.Cell label = byDay ? ReportModel.Cell.date(LocalDate.parse(row.getKey()))
                    : ReportModel.Cell.text(row.getLabel());
            rows.add(List.of(label, ReportModel.Cell.count(row.getViews()), ReportModel.Cell.count(row.getClicks()),
                    ReportModel.Cell.count(row.getInteractions()), ReportModel.Cell.money(row.getCost())));
        }
        StatisticsViewsResponse.Totals totals = views.getTotals();
        List<ReportModel.Kpi> kpis = List.of(
                new ReportModel.Kpi("Affichages", Long.toString(totals.getViews()), null),
                new ReportModel.Kpi("Clics", Long.toString(totals.getClicks()), null),
                new ReportModel.Kpi("Interactions", Long.toString(totals.getInteractions()), null),
                new ReportModel.Kpi("Coût", money(totals.getCost()), "TND"));
        return new ReportModel("Statistiques de diffusion", "Affichages mesurés par " + group.toLowerCase(Locale.FRENCH),
                periodLabel(views.getFrom(), views.getTo()), now, kpis,
                List.of(new ReportModel.Table(byDay ? "Par jour" : "Par " + group.toLowerCase(Locale.FRENCH),
                        List.of(group, "Affichages", "Clics", "Interactions", "Coût (TND)"), rows)),
                null, "views-" + views.getFrom() + "-" + views.getTo());
    }

    private ReportModel dashboard(DashboardResponse d, LocalDate today, Instant now) {
        List<ReportModel.Kpi> kpis = List.of(
                new ReportModel.Kpi("Campagnes en diffusion", Long.toString(d.getActiveCampaigns()), null),
                new ReportModel.Kpi("Campagnes à décider", Long.toString(d.getPendingCampaigns()), null),
                new ReportModel.Kpi("Affichages publicitaires", Long.toString(d.getTotalViews()), null),
                new ReportModel.Kpi("Budget consommé", money(d.getConsumedBudget()), "TND"));
        List<List<ReportModel.Cell>> rows = new ArrayList<>();
        rows.add(row("Campagnes (total)", d.getTotalCampaigns()));
        rows.add(row("Campagnes en diffusion", d.getActiveCampaigns()));
        rows.add(row("Campagnes en attente", d.getPendingCampaigns()));
        rows.add(row("Campagnes en analyse IA", d.getAiPendingCampaigns()));
        rows.add(row("Campagnes refusées par l'IA", d.getAiRejectedCampaigns()));
        rows.add(row("Campagnes signalées par l'IA", d.getAiFlaggedCampaigns()));
        rows.add(row("Campagnes à vérifier", d.getReviewRequiredCampaigns()));
        rows.add(row("Campagnes approuvées par l'IA", d.getApprovedByAiCampaigns()));
        rows.add(row("Campagnes programmées", d.getValidatedCampaigns()));
        rows.add(row("Campagnes terminées", d.getTerminatedCampaigns()));
        rows.add(row("Campagnes bloquées", d.getBlockedCampaigns()));
        rows.add(row("Campagnes en brouillon", d.getDraftCampaigns()));
        rows.add(row("Annonceurs", d.getTotalClients()));
        rows.add(row("Annonceurs en attente de validation", d.getPendingClients()));
        rows.add(row("Porteurs (total)", d.getTotalSupports()));
        rows.add(row("Porteurs actifs", d.getAvailableSupports()));
        if (d.getSupportsByStatus() != null) {
            for (Map.Entry<String, Long> entry : d.getSupportsByStatus().entrySet()) {
                rows.add(row("Porteurs " + entry.getKey(), entry.getValue()));
            }
        }
        rows.add(row("Zones (total)", d.getTotalZones()));
        rows.add(row("Zones actives", d.getActiveZones()));
        rows.add(row("Réservations confirmées", d.getConfirmedReservations()));
        rows.add(row("Réservations temporaires", d.getTemporaryReservations()));
        rows.add(row("Réservations annulées", d.getCancelledReservations()));
        rows.add(row("Réservations expirées", d.getExpiredReservations()));
        rows.add(row("Diffusions (total)", d.getTotalDiffusions()));
        rows.add(row("Affichages publicitaires", d.getTotalViews()));
        rows.add(row("Affichages publicitaires aujourd'hui", d.getViewsToday()));
        rows.add(row("Affichages d'urgence", d.getEmergencyViews()));
        rows.add(row("Affichages par défaut", d.getDefaultViews()));
        rows.add(row("Clics", d.getTotalClicks()));
        rows.add(row("Interactions", d.getTotalInteractions()));
        rows.add(moneyRow("Budget des campagnes soumises (TND)", d.getEstimatedBudget()));
        rows.add(moneyRow("Budget consommé (TND)", d.getConsumedBudget()));
        rows.add(moneyRow("Coût estimé des réservations (TND)", d.getEstimatedCost()));
        rows.add(moneyRow("Revenus simulés (TND)", d.getSimulatedRevenue()));
        rows.add(row("Messages d'urgence en cours", d.getActiveEmergencies()));
        return new ReportModel("Tableau de bord TPUB", "Indicateurs de la plateforme", periodLabel(today, today), now,
                kpis, List.of(new ReportModel.Table("Indicateurs", List.of("Indicateur", "Valeur"), rows)), null,
                "dashboard-" + today + "-" + today);
    }

    private ReportModel mine(StatisticsMineResponse mine, Instant now) {
        StatisticsMineResponse.Totals totals = mine.getTotals();
        List<ReportModel.Kpi> kpis = List.of(
                new ReportModel.Kpi("Campagnes", Long.toString(totals.getCampaigns()), null),
                new ReportModel.Kpi("Affichages", Long.toString(totals.getViews()), null),
                new ReportModel.Kpi("Clics", Long.toString(totals.getClicks()), null),
                new ReportModel.Kpi("Budget consommé", money(totals.getConsumedBudget()), "TND"));
        List<List<ReportModel.Cell>> campaigns = new ArrayList<>();
        for (StatisticsMineResponse.CampaignRow row : mine.getByCampaign()) {
            campaigns.add(List.of(ReportModel.Cell.text(row.getName()), ReportModel.Cell.text(row.getStatus()),
                    ReportModel.Cell.count(row.getViews()), ReportModel.Cell.count(row.getClicks()),
                    ReportModel.Cell.count(row.getInteractions()), ReportModel.Cell.count(row.getEstimatedViews()),
                    ReportModel.Cell.money(row.getEstimatedCost()), ReportModel.Cell.money(row.getBudget()),
                    ReportModel.Cell.money(row.getConsumedBudget())));
        }
        return new ReportModel("Mes statistiques TPUB", "Diffusions de vos campagnes",
                periodLabel(mine.getFrom(), mine.getTo()), now, kpis,
                List.of(daily(mine.getDaily()),
                        new ReportModel.Table("Par campagne", List.of("Campagne", "Statut", "Affichages", "Clics",
                                "Interactions", "Affichages estimés", "Coût estimé (TND)", "Budget (TND)",
                                "Budget consommé (TND)"), campaigns)),
                null, "mine-" + mine.getFrom() + "-" + mine.getTo());
    }

    private ReportModel campaign(StatisticsCampaignResponse stats, Instant now) {
        Campaign campaign = campaignRepository.findById(stats.getCampaignId()).orElse(null);
        List<ReportModel.Kpi> kpis = List.of(
                new ReportModel.Kpi("Affichages", Long.toString(stats.getViews()), null),
                new ReportModel.Kpi("Clics", Long.toString(stats.getClicks()), null),
                new ReportModel.Kpi("Budget", money(stats.getBudget()), "TND"),
                new ReportModel.Kpi("Budget consommé", money(stats.getConsumedBudget()), "TND"));
        List<List<ReportModel.Cell>> supports = new ArrayList<>();
        for (StatisticsCampaignResponse.SupportRow row : stats.getBySupport()) {
            supports.add(List.of(ReportModel.Cell.text(row.getName()),
                    ReportModel.Cell.text(row.getZoneName() == null ? "" : row.getZoneName()),
                    ReportModel.Cell.count(row.getViews())));
        }
        List<ReportModel.Table> tables = new ArrayList<>();
        tables.add(identity(campaign, stats));
        tables.add(daily(stats.getDaily()));
        tables.add(new ReportModel.Table("Par Porteur", List.of("Porteur", "Zone", "Affichages"), supports));
        aiSummary(stats.getCampaignId()).ifPresent(tables::add);
        return new ReportModel("Rapport de campagne : " + stats.getName(),
                campaign != null && campaign.getClient() != null ? campaign.getClient().getCompanyName() : null,
                periodLabel(stats.getFrom(), stats.getTo()), now, kpis, tables, primaryMediaId(stats.getCampaignId()),
                "campaign-" + stats.getFrom() + "-" + stats.getTo());
    }

    private ReportModel.Table identity(Campaign campaign, StatisticsCampaignResponse stats) {
        List<List<ReportModel.Cell>> rows = new ArrayList<>();
        rows.add(List.of(ReportModel.Cell.text("Campagne"), ReportModel.Cell.text(stats.getName())));
        if (campaign != null && campaign.getClient() != null) {
            rows.add(List.of(ReportModel.Cell.text("Annonceur"),
                    ReportModel.Cell.text(campaign.getClient().getCompanyName())));
        }
        rows.add(List.of(ReportModel.Cell.text("Statut"), ReportModel.Cell.text(stats.getStatus())));
        if (campaign != null && campaign.getStartDate() != null && campaign.getEndDate() != null) {
            rows.add(List.of(ReportModel.Cell.text("Période de diffusion"),
                    ReportModel.Cell.text(campaign.getStartDate() + " → " + campaign.getEndDate())));
        }
        rows.add(List.of(ReportModel.Cell.text("Budget (TND)"), ReportModel.Cell.money(stats.getBudget())));
        rows.add(List.of(ReportModel.Cell.text("Budget consommé (TND)"),
                ReportModel.Cell.money(stats.getConsumedBudget())));
        return new ReportModel.Table("Identité", List.of("Champ", "Valeur"), rows);
    }

    private java.util.Optional<ReportModel.Table> aiSummary(Long campaignId) {
        return aiContentCheckRepository.findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(campaignId)
                .map(check -> {
                    List<List<ReportModel.Cell>> rows = new ArrayList<>();
                    rows.add(List.of(ReportModel.Cell.text("Statut IA"),
                            ReportModel.Cell.text(check.getAiStatus() == null ? "" : check.getAiStatus().name())));
                    rows.add(List.of(ReportModel.Cell.text("Score de risque"),
                            ReportModel.Cell.count(check.getRiskScore() == null ? 0 : check.getRiskScore())));
                    rows.add(List.of(ReportModel.Cell.text("Score de qualité"),
                            ReportModel.Cell.count(check.getQualityScore() == null ? 0 : check.getQualityScore())));
                    topIssues(check).forEach(issue ->
                            rows.add(List.of(ReportModel.Cell.text("Point signalé"), ReportModel.Cell.text(issue))));
                    return new ReportModel.Table("Analyse IA", List.of("Champ", "Valeur"), rows);
                });
    }

    private static List<String> topIssues(AiContentCheck check) {
        List<String> issues = check.getDetectedIssues() == null ? List.of() : check.getDetectedIssues();
        return issues.stream().limit(5).toList();
    }

    /** Image of the PDF: the first IMAGE or BANNER media of the campaign. */
    private Long primaryMediaId(Long campaignId) {
        return mediaFileRepository.findByCampaignIdOrderBySortOrderAscIdAsc(campaignId).stream()
                .filter(media -> media.getFileType() == MediaFileType.IMAGE || media.getFileType() == MediaFileType.BANNER)
                .map(MediaFile::getId)
                .findFirst()
                .orElse(null);
    }

    private static ReportModel.Table daily(List<StatisticsDailyRow> daily) {
        List<List<ReportModel.Cell>> rows = new ArrayList<>();
        for (StatisticsDailyRow row : daily) {
            rows.add(List.of(ReportModel.Cell.date(row.getDate()), ReportModel.Cell.count(row.getViews()),
                    ReportModel.Cell.count(row.getClicks()), ReportModel.Cell.count(row.getInteractions()),
                    ReportModel.Cell.money(row.getCost())));
        }
        return new ReportModel.Table("Par jour",
                List.of("Date", "Affichages", "Clics", "Interactions", "Coût (TND)"), rows);
    }

    private static List<ReportModel.Cell> row(String label, long value) {
        return List.of(ReportModel.Cell.text(label), ReportModel.Cell.count(value));
    }

    private static List<ReportModel.Cell> moneyRow(String label, BigDecimal value) {
        return List.of(ReportModel.Cell.text(label), ReportModel.Cell.money(value));
    }

    private static String money(BigDecimal value) {
        BigDecimal amount = value == null ? BigDecimal.ZERO : value;
        return amount.setScale(3, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    static String periodLabel(LocalDate from, LocalDate to) {
        return "Du " + ExportFormats.FRENCH_DATE.format(from) + " au " + ExportFormats.FRENCH_DATE.format(to);
    }
}
