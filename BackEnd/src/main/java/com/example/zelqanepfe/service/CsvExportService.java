package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.DashboardResponse;
import com.example.zelqanepfe.dto.StatisticsCampaignResponse;
import com.example.zelqanepfe.dto.StatisticsDailyRow;
import com.example.zelqanepfe.dto.StatisticsMineResponse;
import com.example.zelqanepfe.dto.StatisticsViewsResponse;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Statistics CSV export (contract §2.9): UTF-8 with BOM, {@code ;} separator, decimal comma, French headers.
 */
@Service
@RequiredArgsConstructor
public class CsvExportService {

    static final String BOM = "﻿";
    static final String SEPARATOR = ";";
    static final String NEWLINE = "\r\n";
    static final DateTimeFormatter FRENCH_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final Pattern NUMBER = Pattern.compile("-?\\d+([.,]\\d+)?");
    private static final String FORMULA_TRIGGERS = "=+-@\t\r";
    private static final Set<String> STAFF = Set.of(
            RoleCode.ADMINISTRATEUR.name(), RoleCode.SUPERVISEUR.name(), RoleCode.OPERATEUR.name());

    private final StatisticsService statisticsService;

    public record CsvFile(String filename, byte[] content) {
    }

    public record ExportQuery(String type, LocalDate from, LocalDate to, String groupBy, Long campaignId) {
    }

    @Transactional(readOnly = true)
    public CsvFile export(ExportQuery query) {
        String type = query.type() == null ? "" : query.type().trim().toLowerCase(Locale.ROOT);
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        String role = user != null ? user.getRoleCode() : null;
        return switch (type) {
            case "views" -> {
                requireStaff(role);
                StatisticsViewsResponse views = statisticsService.views(new StatisticsService.ViewsQuery(
                        query.from(), query.to(), query.groupBy(), query.campaignId(), null, null, List.of()));
                yield file(type, views.getFrom(), views.getTo(), views(views));
            }
            case "dashboard" -> {
                requireStaff(role);
                LocalDate today = statisticsService.range(null, null).to();
                yield file(type, today, today, dashboard(statisticsService.getDashboard()));
            }
            case "mine" -> {
                if (!RoleCode.ANNONCEUR.name().equals(role)) {
                    throw NetworkErrors.accessDenied();
                }
                StatisticsMineResponse mine = statisticsService.mine(query.from(), query.to());
                yield file(type, mine.getFrom(), mine.getTo(), mine(mine));
            }
            case "campaign" -> {
                if (query.campaignId() == null) {
                    throw NetworkErrors.missingParameter("campaignId", "Paramètre obligatoire : campaignId.");
                }
                StatisticsCampaignResponse campaign = statisticsService.campaign(query.campaignId(), query.from(), query.to());
                yield file(type, campaign.getFrom(), campaign.getTo(), campaign(campaign));
            }
            default -> throw NetworkErrors.exportTypeInvalid();
        };
    }

    private static void requireStaff(String role) {
        if (role == null || !STAFF.contains(role)) {
            throw NetworkErrors.accessDenied();
        }
    }

    static CsvFile file(String type, LocalDate from, LocalDate to, List<List<String>> rows) {
        StringBuilder csv = new StringBuilder(BOM);
        for (List<String> row : rows) {
            csv.append(String.join(SEPARATOR, row.stream().map(CsvExportService::escape).toList())).append(NEWLINE);
        }
        String filename = "zelqane-statistiques-" + type + "-" + from + "-" + to + ".csv";
        return new CsvFile(filename, csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    static List<List<String>> views(StatisticsViewsResponse views) {
        List<List<String>> rows = new ArrayList<>();
        boolean byDay = "day".equals(views.getGroupBy());
        String group = switch (views.getGroupBy()) {
            case "campaign" -> "Campagne";
            case "support" -> "Porteur";
            case "zone" -> "Zone";
            default -> "Date";
        };
        rows.add(byDay ? List.of("Date", "Affichages", "Clics", "Interactions", "Coût (TND)")
                : List.of(group, "Affichages", "Clics", "Interactions", "Coût (TND)"));
        for (StatisticsViewsResponse.Row row : views.getRows()) {
            String label = byDay ? FRENCH_DATE.format(LocalDate.parse(row.getKey())) : row.getLabel();
            rows.add(List.of(label, number(row.getViews()), number(row.getClicks()), number(row.getInteractions()),
                    money(row.getCost())));
        }
        StatisticsViewsResponse.Totals totals = views.getTotals();
        rows.add(List.of("Total", number(totals.getViews()), number(totals.getClicks()), number(totals.getInteractions()),
                money(totals.getCost())));
        return rows;
    }

    static List<List<String>> dashboard(DashboardResponse d) {
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of("Indicateur", "Valeur"));
        rows.add(List.of("Campagnes (total)", number(d.getTotalCampaigns())));
        rows.add(List.of("Campagnes en diffusion", number(d.getActiveCampaigns())));
        rows.add(List.of("Campagnes en attente", number(d.getPendingCampaigns())));
        rows.add(List.of("Campagnes en analyse IA", number(d.getAiPendingCampaigns())));
        rows.add(List.of("Campagnes refusées par l'IA", number(d.getAiRejectedCampaigns())));
        rows.add(List.of("Campagnes signalées par l'IA", number(d.getAiFlaggedCampaigns())));
        rows.add(List.of("Campagnes à vérifier", number(d.getReviewRequiredCampaigns())));
        rows.add(List.of("Campagnes approuvées par l'IA", number(d.getApprovedByAiCampaigns())));
        rows.add(List.of("Campagnes programmées", number(d.getValidatedCampaigns())));
        rows.add(List.of("Campagnes terminées", number(d.getTerminatedCampaigns())));
        rows.add(List.of("Campagnes bloquées", number(d.getBlockedCampaigns())));
        rows.add(List.of("Campagnes en brouillon", number(d.getDraftCampaigns())));
        rows.add(List.of("Annonceurs", number(d.getTotalClients())));
        rows.add(List.of("Annonceurs en attente de validation", number(d.getPendingClients())));
        rows.add(List.of("Porteurs (total)", number(d.getTotalSupports())));
        rows.add(List.of("Porteurs actifs", number(d.getAvailableSupports())));
        if (d.getSupportsByStatus() != null) {
            for (Map.Entry<String, Long> entry : d.getSupportsByStatus().entrySet()) {
                rows.add(List.of("Porteurs " + entry.getKey(), number(entry.getValue())));
            }
        }
        rows.add(List.of("Zones (total)", number(d.getTotalZones())));
        rows.add(List.of("Zones actives", number(d.getActiveZones())));
        rows.add(List.of("Réservations confirmées", number(d.getConfirmedReservations())));
        rows.add(List.of("Réservations temporaires", number(d.getTemporaryReservations())));
        rows.add(List.of("Réservations annulées", number(d.getCancelledReservations())));
        rows.add(List.of("Réservations expirées", number(d.getExpiredReservations())));
        rows.add(List.of("Diffusions (total)", number(d.getTotalDiffusions())));
        rows.add(List.of("Affichages publicitaires", number(d.getTotalViews())));
        rows.add(List.of("Affichages publicitaires aujourd'hui", number(d.getViewsToday())));
        rows.add(List.of("Affichages d'urgence", number(d.getEmergencyViews())));
        rows.add(List.of("Affichages par défaut", number(d.getDefaultViews())));
        rows.add(List.of("Clics", number(d.getTotalClicks())));
        rows.add(List.of("Interactions", number(d.getTotalInteractions())));
        rows.add(List.of("Budget des campagnes soumises (TND)", money(d.getEstimatedBudget())));
        rows.add(List.of("Budget consommé (TND)", money(d.getConsumedBudget())));
        rows.add(List.of("Coût estimé des réservations (TND)", money(d.getEstimatedCost())));
        rows.add(List.of("Revenus simulés (TND)", money(d.getSimulatedRevenue())));
        rows.add(List.of("Messages d'urgence en cours", number(d.getActiveEmergencies())));
        return rows;
    }

    static List<List<String>> mine(StatisticsMineResponse mine) {
        List<List<String>> rows = new ArrayList<>(daily(mine.getDaily()));
        rows.add(List.of());
        rows.add(List.of("Campagne", "Statut", "Affichages", "Clics", "Interactions", "Affichages estimés",
                "Coût estimé (TND)", "Budget (TND)", "Budget consommé (TND)"));
        for (StatisticsMineResponse.CampaignRow row : mine.getByCampaign()) {
            rows.add(List.of(row.getName(), row.getStatus(), number(row.getViews()), number(row.getClicks()),
                    number(row.getInteractions()), number(row.getEstimatedViews()), money(row.getEstimatedCost()),
                    money(row.getBudget()), money(row.getConsumedBudget())));
        }
        return rows;
    }

    static List<List<String>> campaign(StatisticsCampaignResponse campaign) {
        List<List<String>> rows = new ArrayList<>(daily(campaign.getDaily()));
        rows.add(List.of());
        rows.add(List.of("Porteur", "Zone", "Affichages"));
        for (StatisticsCampaignResponse.SupportRow row : campaign.getBySupport()) {
            rows.add(List.of(row.getName(), row.getZoneName() == null ? "" : row.getZoneName(), number(row.getViews())));
        }
        return rows;
    }

    static List<List<String>> daily(List<StatisticsDailyRow> daily) {
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of("Date", "Affichages", "Clics", "Interactions", "Coût (TND)"));
        for (StatisticsDailyRow row : daily) {
            rows.add(List.of(FRENCH_DATE.format(row.getDate()), number(row.getViews()), number(row.getClicks()),
                    number(row.getInteractions()), money(row.getCost())));
        }
        return rows;
    }

    static String number(long value) {
        return Long.toString(value);
    }

    /** TND with 3 decimals (millimes) and a decimal comma. */
    static String money(BigDecimal value) {
        BigDecimal amount = value == null ? BigDecimal.ZERO : value;
        return amount.setScale(3, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    /** Prefixes an apostrophe to text a spreadsheet would evaluate as a formula (CSV injection); numbers are kept. */
    static String neutraliseFormula(String value) {
        if (value.isEmpty() || NUMBER.matcher(value).matches()) {
            return value;
        }
        char first = value.charAt(0);
        return FORMULA_TRIGGERS.indexOf(first) >= 0 ? "'" + value : value;
    }

    /** Formula neutralisation, then RFC 4180 quoting. */
    static String escape(String raw) {
        if (raw == null) {
            return "";
        }
        String value = neutraliseFormula(raw);
        if (value.contains(SEPARATOR) || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
