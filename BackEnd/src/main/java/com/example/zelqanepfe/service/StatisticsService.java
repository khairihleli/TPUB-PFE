package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.DashboardResponse;
import com.example.zelqanepfe.dto.StatisticsCampaignResponse;
import com.example.zelqanepfe.dto.StatisticsDailyRow;
import com.example.zelqanepfe.dto.StatisticsHistoryResponse;
import com.example.zelqanepfe.dto.StatisticsMineResponse;
import com.example.zelqanepfe.dto.StatisticsViewsResponse;
import com.example.zelqanepfe.model.AiContentCheck;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignAiStatus;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.ClientValidationStatus;
import com.example.zelqanepfe.model.DiffusionContentType;
import com.example.zelqanepfe.model.DiffusionInteraction;
import com.example.zelqanepfe.model.DiffusionLog;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.InteractionType;
import com.example.zelqanepfe.model.PaymentStatus;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.Statistic;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.AiContentCheckRepository;
import com.example.zelqanepfe.repository.CampaignRepository;
import com.example.zelqanepfe.repository.ClientRepository;
import com.example.zelqanepfe.repository.DiffusionInteractionRepository;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.EmergencyMessageRepository;
import com.example.zelqanepfe.repository.PaymentSimulationRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.StatisticRepository;
import com.example.zelqanepfe.repository.ZoneRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Statistics (contract §2.9): dashboard, views grouped by day/campaign/support/zone, advertiser and campaign
 * statistics, daily history. Measured figures always come from the diffusion logs and interactions.
 */
@Service
@RequiredArgsConstructor
public class StatisticsService {

    static final long MAX_RANGE_DAYS = 366;
    static final int DEFAULT_DAYS = 30;
    static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("dd/MM");
    static final Set<CampaignStatus> PENDING = Set.of(
            CampaignStatus.PENDING_AI_CHECK, CampaignStatus.APPROVED_BY_AI, CampaignStatus.REVIEW_REQUIRED);

    public enum GroupBy { DAY, CAMPAIGN, SUPPORT, ZONE }

    private final CampaignRepository campaignRepository;
    private final ClientRepository clientRepository;
    private final DiffusionSupportRepository supportRepository;
    private final ZoneRepository zoneRepository;
    private final ReservationRepository reservationRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final DiffusionInteractionRepository interactionRepository;
    private final PaymentSimulationRepository paymentSimulationRepository;
    private final EmergencyMessageRepository emergencyMessageRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final StatisticRepository statisticRepository;
    private final CampaignAccessGuard accessGuard;
    private final Clock clock;

    public record Range(LocalDate from, LocalDate to) {
    }

    // --- dashboard -----------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public DashboardResponse getDashboard() {
        List<Campaign> campaigns = campaignRepository.findAll();
        Map<CampaignStatus, Long> byStatus = countByStatus(campaigns);
        List<DiffusionSupport> supports = supportRepository.findAll();
        Map<String, Long> supportsByStatus = new LinkedHashMap<>();
        for (TechnicalStatus status : TechnicalStatus.values()) {
            supportsByStatus.put(status.name(), supports.stream().filter(s -> s.getTechnicalStatus() == status).count());
        }
        List<Client> clients = clientRepository.findAll();
        List<Reservation> reservations = reservationRepository.findAll();
        LocalDate today = LocalDate.now(clock);
        LocalDateTime now = LocalDateTime.now(clock);

        return DashboardResponse.builder()
                .totalCampaigns(campaigns.size())
                .activeCampaigns(byStatus.get(CampaignStatus.ACTIVE))
                .pendingCampaigns(PENDING.stream().mapToLong(byStatus::get).sum())
                .aiPendingCampaigns(byStatus.get(CampaignStatus.PENDING_AI_CHECK))
                .aiRejectedCampaigns(byStatus.get(CampaignStatus.REJECTED_BY_AI))
                .availableSupports(supportsByStatus.get(TechnicalStatus.ACTIF.name()))
                .confirmedReservations(countReservations(reservations, ReservationStatus.CONFIRMEE))
                .totalViews(diffusionLogRepository.countByContentType(DiffusionContentType.PUBLICITE))
                .estimatedBudget(campaigns.stream().filter(c -> c.getStatus() != CampaignStatus.BROUILLON)
                        .map(c -> nz(c.getBudget())).reduce(BigDecimal.ZERO, BigDecimal::add))
                .consumedBudget(campaigns.stream().map(c -> nz(c.getConsumedBudget())).reduce(BigDecimal.ZERO, BigDecimal::add))
                .aiFlaggedCampaigns(campaigns.stream().filter(c -> c.getAiStatus() == CampaignAiStatus.REVIEW_REQUIRED
                        || c.getAiStatus() == CampaignAiStatus.REJECTED).count())
                .reviewRequiredCampaigns(byStatus.get(CampaignStatus.REVIEW_REQUIRED))
                .approvedByAiCampaigns(byStatus.get(CampaignStatus.APPROVED_BY_AI))
                .validatedCampaigns(byStatus.get(CampaignStatus.VALIDATED_BY_ADMIN))
                .terminatedCampaigns(byStatus.get(CampaignStatus.TERMINATED))
                .blockedCampaigns(byStatus.get(CampaignStatus.BLOCKED))
                .draftCampaigns(byStatus.get(CampaignStatus.BROUILLON))
                .totalClients(clients.size())
                .pendingClients(clients.stream().filter(c -> c.getValidationStatus() == ClientValidationStatus.PENDING).count())
                .totalSupports(supports.size())
                .supportsByStatus(supportsByStatus)
                .totalZones(zoneRepository.count())
                .activeZones(zoneRepository.countByIsActiveTrue())
                .temporaryReservations(countReservations(reservations, ReservationStatus.TEMPORAIRE))
                .cancelledReservations(countReservations(reservations, ReservationStatus.ANNULEE))
                .expiredReservations(countReservations(reservations, ReservationStatus.EXPIREE))
                .totalDiffusions(diffusionLogRepository.count())
                .emergencyViews(diffusionLogRepository.countByContentType(DiffusionContentType.URGENCE))
                .defaultViews(diffusionLogRepository.countByContentType(DiffusionContentType.DEFAUT))
                .viewsToday(diffusionLogRepository.countByContentTypeAndDiffusedAtGreaterThanEqualAndDiffusedAtLessThan(
                        DiffusionContentType.PUBLICITE, startOf(today), startOf(today.plusDays(1))))
                .totalClicks(interactionRepository.countByInteractionType(InteractionType.CLIC))
                .totalInteractions(interactionRepository.countByInteractionType(InteractionType.INTERACTION))
                .estimatedCost(reservations.stream().filter(r -> AvailabilityRules.LIVE.contains(r.getReservationStatus()))
                        .map(r -> nz(r.getEstimatedCost())).reduce(BigDecimal.ZERO, BigDecimal::add))
                .simulatedRevenue(nz(paymentSimulationRepository.sumAmountByStatusIn(
                        List.of(PaymentStatus.SIMULATED, PaymentStatus.COMPLETED))))
                .activeEmergencies(emergencyMessageRepository.findByIsActiveTrue().stream()
                        .filter(e -> !now.isBefore(DiffusionService.startAt(e)) && !now.isAfter(DiffusionService.endAt(e)))
                        .count())
                .build();
    }

    // --- views ---------------------------------------------------------------------------------------------------

    public record ViewsQuery(LocalDate from, LocalDate to, String groupBy, Long campaignId, Long supportId, Long zoneId,
                             List<DiffusionContentType> contentTypes) {
    }

    @Transactional(readOnly = true)
    public StatisticsViewsResponse views(ViewsQuery query) {
        Range range = range(query.from(), query.to());
        GroupBy groupBy = parseGroupBy(query.groupBy());
        List<DiffusionContentType> types = query.contentTypes() == null || query.contentTypes().isEmpty()
                ? List.of(DiffusionContentType.PUBLICITE) : query.contentTypes();
        List<DiffusionLog> logs = logs(range, types).stream()
                .filter(l -> query.campaignId() == null || (l.getCampaign() != null && Objects.equals(l.getCampaign().getId(), query.campaignId())))
                .filter(l -> query.supportId() == null || Objects.equals(l.getSupport().getId(), query.supportId()))
                .filter(l -> query.zoneId() == null || Objects.equals(zoneOf(l) == null ? null : zoneOf(l).getId(), query.zoneId()))
                .toList();
        Map<Long, long[]> interactions = interactions(range);
        List<StatisticsViewsResponse.Row> rows = aggregate(logs, interactions, groupBy, range);
        return StatisticsViewsResponse.builder()
                .from(range.from())
                .to(range.to())
                .groupBy(groupBy.name().toLowerCase(Locale.ROOT))
                .rows(rows)
                .totals(StatisticsViewsResponse.Totals.builder()
                        .views(rows.stream().mapToLong(StatisticsViewsResponse.Row::getViews).sum())
                        .clicks(rows.stream().mapToLong(StatisticsViewsResponse.Row::getClicks).sum())
                        .interactions(rows.stream().mapToLong(StatisticsViewsResponse.Row::getInteractions).sum())
                        .cost(rows.stream().map(StatisticsViewsResponse.Row::getCost).reduce(BigDecimal.ZERO, BigDecimal::add))
                        .build())
                .build();
    }

    /** Groups logs; day rows are zero-filled over the range, other groupings sorted by views desc. */
    List<StatisticsViewsResponse.Row> aggregate(List<DiffusionLog> logs, Map<Long, long[]> interactions, GroupBy groupBy,
                                                Range range) {
        Map<String, StatisticsViewsResponse.Row> rows = new LinkedHashMap<>();
        if (groupBy == GroupBy.DAY) {
            for (LocalDate day = range.from(); !day.isAfter(range.to()); day = day.plusDays(1)) {
                rows.put(day.toString(), emptyRow(day.toString(), DAY_LABEL.format(day)));
            }
        }
        for (DiffusionLog log : logs) {
            String key;
            String label;
            switch (groupBy) {
                case DAY -> {
                    LocalDate day = dayOf(log.getDiffusedAt());
                    key = day.toString();
                    label = DAY_LABEL.format(day);
                }
                case CAMPAIGN -> {
                    key = log.getCampaign() != null ? String.valueOf(log.getCampaign().getId()) : "none";
                    label = log.getCampaign() != null ? log.getCampaign().getName() : "Sans campagne";
                }
                case SUPPORT -> {
                    key = String.valueOf(log.getSupport().getId());
                    label = log.getSupport().getName();
                }
                default -> {
                    Zone zone = zoneOf(log);
                    key = zone != null ? String.valueOf(zone.getId()) : "none";
                    label = zone != null ? zone.getName() : "Sans zone";
                }
            }
            StatisticsViewsResponse.Row row = rows.computeIfAbsent(key, k -> emptyRow(k, label));
            long[] counts = interactions.getOrDefault(log.getId(), new long[2]);
            row.setViews(row.getViews() + 1);
            row.setClicks(row.getClicks() + counts[0]);
            row.setInteractions(row.getInteractions() + counts[1]);
            row.setCost(row.getCost().add(nz(log.getCost())));
        }
        List<StatisticsViewsResponse.Row> result = new ArrayList<>(rows.values());
        if (groupBy != GroupBy.DAY) {
            result.sort(Comparator.comparingLong(StatisticsViewsResponse.Row::getViews).reversed()
                    .thenComparing(StatisticsViewsResponse.Row::getLabel, String.CASE_INSENSITIVE_ORDER));
        }
        return result;
    }

    // --- advertiser ----------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public StatisticsMineResponse mine(LocalDate from, LocalDate to) {
        Range range = range(from, to);
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        if (user == null) {
            throw CampaignErrors.clientProfileMissing();
        }
        Client client = clientRepository.findByUserId(user.getId()).orElseThrow(CampaignErrors::clientProfileMissing);
        List<Campaign> campaigns = campaignRepository.findByClientId(client.getId()).stream()
                .sorted(Comparator.comparing(Campaign::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Campaign::getId, Comparator.reverseOrder()))
                .toList();
        Set<Long> ids = campaigns.stream().map(Campaign::getId).collect(Collectors.toSet());
        List<DiffusionLog> logs = ids.isEmpty() ? List.of() : logs(range, List.of(DiffusionContentType.PUBLICITE)).stream()
                .filter(l -> l.getCampaign() != null && ids.contains(l.getCampaign().getId()))
                .toList();
        Map<Long, long[]> interactions = interactions(range);
        Map<Long, List<Reservation>> reservations = ids.isEmpty() ? Map.of() : ids.stream()
                .collect(Collectors.toMap(Function.identity(), reservationRepository::findByCampaignId));

        Map<CampaignStatus, Long> byStatus = countByStatus(campaigns);
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        byStatus.forEach((status, count) -> statusCounts.put(status.name(), count));

        List<StatisticsMineResponse.CampaignRow> byCampaign = new ArrayList<>();
        long confirmed = 0;
        BigDecimal estimatedCost = BigDecimal.ZERO;
        for (Campaign campaign : campaigns) {
            List<DiffusionLog> own = logs.stream().filter(l -> l.getCampaign().getId().equals(campaign.getId())).toList();
            long[] totals = sumInteractions(own, interactions);
            List<Reservation> rs = reservations.getOrDefault(campaign.getId(), List.of());
            BigDecimal cost = liveCost(rs);
            estimatedCost = estimatedCost.add(cost);
            confirmed += rs.stream().filter(r -> r.getReservationStatus() == ReservationStatus.CONFIRMEE).count();
            byCampaign.add(StatisticsMineResponse.CampaignRow.builder()
                    .campaignId(campaign.getId())
                    .name(campaign.getName())
                    .status(campaign.getStatus().name())
                    .views(own.size())
                    .clicks(totals[0])
                    .interactions(totals[1])
                    .estimatedViews(campaign.getEstimatedViews() == null ? 0 : campaign.getEstimatedViews())
                    .estimatedCost(cost)
                    .budget(nz(campaign.getBudget()))
                    .consumedBudget(nz(campaign.getConsumedBudget()))
                    .build());
        }
        long[] allInteractions = sumInteractions(logs, interactions);
        StatisticsMineResponse.Totals totals = StatisticsMineResponse.Totals.builder()
                .campaigns(campaigns.size())
                .activeCampaigns(byStatus.get(CampaignStatus.ACTIVE))
                .pendingCampaigns(PENDING.stream().mapToLong(byStatus::get).sum())
                .views(logs.size())
                .clicks(allInteractions[0])
                .interactions(allInteractions[1])
                .estimatedViews(campaigns.stream().mapToLong(c -> c.getEstimatedViews() == null ? 0 : c.getEstimatedViews()).sum())
                .estimatedCost(estimatedCost)
                .estimatedBudget(campaigns.stream().filter(c -> c.getStatus() != CampaignStatus.BROUILLON)
                        .map(c -> nz(c.getBudget())).reduce(BigDecimal.ZERO, BigDecimal::add))
                .consumedBudget(campaigns.stream().map(c -> nz(c.getConsumedBudget())).reduce(BigDecimal.ZERO, BigDecimal::add))
                .confirmedReservations(confirmed)
                .build();
        return StatisticsMineResponse.builder()
                .from(range.from())
                .to(range.to())
                .totals(totals)
                .statusCounts(statusCounts)
                .daily(daily(logs, interactions, range))
                .byCampaign(byCampaign)
                .bySupport(bySupport(logs))
                .byZone(byZone(logs))
                .build();
    }

    @Transactional(readOnly = true)
    public StatisticsCampaignResponse campaign(Long campaignId, LocalDate from, LocalDate to) {
        Campaign campaign = accessGuard.readable(campaignId);
        Range range = campaignRange(campaign, from, to, LocalDate.now(clock));
        List<DiffusionLog> logs = logs(range, List.of(DiffusionContentType.PUBLICITE)).stream()
                .filter(l -> l.getCampaign() != null && Objects.equals(l.getCampaign().getId(), campaign.getId()))
                .toList();
        Map<Long, long[]> interactions = interactions(range);
        long[] totals = sumInteractions(logs, interactions);
        BigDecimal budget = nz(campaign.getBudget());
        BigDecimal consumed = nz(campaign.getConsumedBudget());
        return StatisticsCampaignResponse.builder()
                .campaignId(campaign.getId())
                .name(campaign.getName())
                .status(campaign.getStatus().name())
                .from(range.from())
                .to(range.to())
                .budget(budget)
                .consumedBudget(consumed)
                .remainingBudget(budget.subtract(consumed).max(BigDecimal.ZERO))
                .estimatedViews(campaign.getEstimatedViews() == null ? 0 : campaign.getEstimatedViews())
                .estimatedCost(liveCost(reservationRepository.findByCampaignId(campaign.getId())))
                .views(logs.size())
                .clicks(totals[0])
                .interactions(totals[1])
                .lastDiffusionAt(diffusionLogRepository.findLastDiffusionOfCampaign(DiffusionContentType.PUBLICITE, campaign.getId()))
                .daily(daily(logs, interactions, range))
                .bySupport(bySupport(logs))
                .byZone(byZone(logs))
                .build();
    }

    /** Explicit bounds win; otherwise the campaign period clipped to today (last 30 days when dates are null). */
    static Range campaignRange(Campaign campaign, LocalDate from, LocalDate to, LocalDate today) {
        LocalDate end = to;
        if (end == null) {
            end = campaign.getEndDate() == null || campaign.getEndDate().isAfter(today) ? today : campaign.getEndDate();
        }
        LocalDate start = from;
        if (start == null) {
            start = campaign.getStartDate() == null ? end.minusDays(DEFAULT_DAYS - 1L) : campaign.getStartDate();
            if (start.isAfter(end)) {
                start = end;
            }
            if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_RANGE_DAYS) {
                start = end.minusDays(MAX_RANGE_DAYS - 1);
            }
        }
        return checkRange(start, end);
    }

    // --- history & snapshot ----------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<StatisticsHistoryResponse> history(LocalDate from, LocalDate to) {
        Range range = range(from, to);
        List<Statistic> snapshots = statisticRepository
                .findByStatDateBetweenAndCampaignIdIsNullAndSupportIdIsNullAndZoneIdIsNullOrderByStatDateAsc(range.from(), range.to());
        if (snapshots.isEmpty()) {
            return List.of();
        }
        Map<LocalDate, long[]> measured = measuredPerDay(range);
        return snapshots.stream().map(s -> {
            long[] m = measured.getOrDefault(s.getStatDate(), new long[3]);
            return StatisticsHistoryResponse.builder()
                    .date(s.getStatDate())
                    .totalCampaigns(s.getTotalCampaigns())
                    .activeCampaigns(s.getActiveCampaigns())
                    .pendingCampaigns(s.getPendingCampaigns())
                    .aiPendingCampaigns(s.getAiPendingCampaigns())
                    .aiRejectedCampaigns(s.getAiRejectedCampaigns())
                    .availableSupports(s.getAvailableSupports())
                    .confirmedReservations(s.getConfirmedReservations())
                    .views(m[0])
                    .clicks(m[1])
                    .interactions(m[2])
                    .estimatedBudget(s.getEstimatedBudget())
                    .consumedBudget(s.getConsumedBudget())
                    .avgRiskScore(s.getAvgRiskScore())
                    .avgQualityScore(s.getAvgQualityScore())
                    .build();
        }).toList();
    }

    /** Upserts today's platform row (campaign, support and zone null). */
    @Transactional
    public Statistic snapshotToday() {
        LocalDate today = LocalDate.now(clock);
        DashboardResponse dashboard = getDashboard();
        List<AiContentCheck> checks = aiContentCheckRepository.findByIsPreviewFalse();
        long[] measured = measuredPerDay(new Range(today, today)).getOrDefault(today, new long[3]);
        Statistic row = statisticRepository.findByStatDateAndCampaignIdIsNullAndSupportIdIsNullAndZoneIdIsNull(today)
                .orElseGet(() -> Statistic.builder().statDate(today).build());
        row.setTotalCampaigns((int) dashboard.getTotalCampaigns());
        row.setActiveCampaigns((int) dashboard.getActiveCampaigns());
        row.setPendingCampaigns((int) dashboard.getPendingCampaigns());
        row.setAiPendingCampaigns((int) dashboard.getAiPendingCampaigns());
        row.setAiRejectedCampaigns((int) dashboard.getAiRejectedCampaigns());
        row.setAvailableSupports((int) dashboard.getAvailableSupports());
        row.setConfirmedReservations((int) dashboard.getConfirmedReservations());
        row.setViewsCount(measured[0]);
        row.setClicksCount(measured[1]);
        row.setInteractionsCount(measured[2]);
        row.setEstimatedBudget(dashboard.getEstimatedBudget().setScale(2, RoundingMode.HALF_UP));
        row.setConsumedBudget(dashboard.getConsumedBudget().setScale(2, RoundingMode.HALF_UP));
        row.setAvgRiskScore(average(checks.stream().map(AiContentCheck::getRiskScore).toList()));
        row.setAvgQualityScore(average(checks.stream().map(AiContentCheck::getQualityScore).toList()));
        return statisticRepository.save(row);
    }

    // --- helpers -------------------------------------------------------------------------------------------------

    Range range(LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : LocalDate.now(clock);
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DAYS - 1L);
        return checkRange(start, end);
    }

    static Range checkRange(LocalDate start, LocalDate end) {
        if (end.isBefore(start)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_RANGE_DAYS) {
            throw NetworkErrors.invalidRange("La période ne peut pas dépasser 366 jours.");
        }
        return new Range(start, end);
    }

    static GroupBy parseGroupBy(String raw) {
        if (raw == null || raw.isBlank()) {
            return GroupBy.DAY;
        }
        try {
            return GroupBy.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw CampaignErrors.invalidParameter("groupBy", "Regroupement invalide : utilisez day, campaign, support ou zone.");
        }
    }

    private List<DiffusionLog> logs(Range range, List<DiffusionContentType> types) {
        return diffusionLogRepository.findForStatistics(types, startOf(range.from()), startOf(range.to().plusDays(1)));
    }

    /** Log id → [clicks, interactions] for logs diffused in the range. */
    private Map<Long, long[]> interactions(Range range) {
        Map<Long, long[]> result = new HashMap<>();
        for (DiffusionInteraction interaction : interactionRepository.findByLogDiffusedBetween(
                startOf(range.from()), startOf(range.to().plusDays(1)))) {
            long[] counts = result.computeIfAbsent(interaction.getDiffusionLog().getId(), k -> new long[2]);
            counts[interaction.getInteractionType() == InteractionType.CLIC ? 0 : 1]++;
        }
        return result;
    }

    /** Day → [PUBLICITE views, clicks, interactions]. */
    private Map<LocalDate, long[]> measuredPerDay(Range range) {
        Map<LocalDate, long[]> result = new HashMap<>();
        for (DiffusionLog log : logs(range, List.of(DiffusionContentType.PUBLICITE))) {
            result.computeIfAbsent(dayOf(log.getDiffusedAt()), k -> new long[3])[0]++;
        }
        for (DiffusionInteraction interaction : interactionRepository.findByLogDiffusedBetween(
                startOf(range.from()), startOf(range.to().plusDays(1)))) {
            long[] counts = result.computeIfAbsent(dayOf(interaction.getDiffusionLog().getDiffusedAt()), k -> new long[3]);
            counts[interaction.getInteractionType() == InteractionType.CLIC ? 1 : 2]++;
        }
        return result;
    }

    List<StatisticsDailyRow> daily(List<DiffusionLog> logs, Map<Long, long[]> interactions, Range range) {
        return aggregate(logs, interactions, GroupBy.DAY, range).stream()
                .map(row -> StatisticsDailyRow.builder()
                        .date(LocalDate.parse(row.getKey()))
                        .views(row.getViews())
                        .clicks(row.getClicks())
                        .interactions(row.getInteractions())
                        .cost(row.getCost())
                        .build())
                .toList();
    }

    static List<StatisticsCampaignResponse.SupportRow> bySupport(List<DiffusionLog> logs) {
        Map<Long, StatisticsCampaignResponse.SupportRow> rows = new LinkedHashMap<>();
        for (DiffusionLog log : logs) {
            DiffusionSupport support = log.getSupport();
            StatisticsCampaignResponse.SupportRow row = rows.computeIfAbsent(support.getId(), id ->
                    StatisticsCampaignResponse.SupportRow.builder().supportId(id).name(support.getName())
                            .zoneName(support.getZone() != null ? support.getZone().getName() : null).build());
            row.setViews(row.getViews() + 1);
        }
        return rows.values().stream()
                .sorted(Comparator.comparingLong(StatisticsCampaignResponse.SupportRow::getViews).reversed()
                        .thenComparing(StatisticsCampaignResponse.SupportRow::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    static List<StatisticsCampaignResponse.ZoneRow> byZone(List<DiffusionLog> logs) {
        Map<Long, StatisticsCampaignResponse.ZoneRow> rows = new LinkedHashMap<>();
        for (DiffusionLog log : logs) {
            Zone zone = zoneOf(log);
            if (zone == null) {
                continue;
            }
            StatisticsCampaignResponse.ZoneRow row = rows.computeIfAbsent(zone.getId(), id ->
                    StatisticsCampaignResponse.ZoneRow.builder().zoneId(id).name(zone.getName()).build());
            row.setViews(row.getViews() + 1);
        }
        return rows.values().stream()
                .sorted(Comparator.comparingLong(StatisticsCampaignResponse.ZoneRow::getViews).reversed()
                        .thenComparing(StatisticsCampaignResponse.ZoneRow::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private static long[] sumInteractions(List<DiffusionLog> logs, Map<Long, long[]> interactions) {
        long[] total = new long[2];
        for (DiffusionLog log : logs) {
            long[] counts = interactions.get(log.getId());
            if (counts != null) {
                total[0] += counts[0];
                total[1] += counts[1];
            }
        }
        return total;
    }

    private static Zone zoneOf(DiffusionLog log) {
        return log.getZone() != null ? log.getZone() : log.getSupport().getZone();
    }

    private static Map<CampaignStatus, Long> countByStatus(List<Campaign> campaigns) {
        Map<CampaignStatus, Long> counts = new EnumMap<>(CampaignStatus.class);
        for (CampaignStatus status : CampaignStatus.values()) {
            counts.put(status, 0L);
        }
        campaigns.forEach(c -> counts.merge(c.getStatus(), 1L, Long::sum));
        return counts;
    }

    private static long countReservations(List<Reservation> reservations, ReservationStatus status) {
        return reservations.stream().filter(r -> r.getReservationStatus() == status).count();
    }

    private static BigDecimal liveCost(List<Reservation> reservations) {
        return reservations.stream().filter(r -> AvailabilityRules.LIVE.contains(r.getReservationStatus()))
                .map(r -> nz(r.getEstimatedCost())).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static StatisticsViewsResponse.Row emptyRow(String key, String label) {
        return StatisticsViewsResponse.Row.builder().key(key).label(label).cost(BigDecimal.ZERO).build();
    }

    private static BigDecimal average(List<Short> values) {
        if (values.isEmpty()) {
            return null;
        }
        long sum = values.stream().mapToLong(v -> v == null ? 0 : v).sum();
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(values.size()), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private Instant startOf(LocalDate day) {
        return day.atStartOfDay(clock.getZone()).toInstant();
    }

    private LocalDate dayOf(Instant instant) {
        return instant.atZone(clock.getZone()).toLocalDate();
    }
}
