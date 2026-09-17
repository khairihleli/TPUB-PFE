package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.model.AiContentCheck;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportAvailability;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.repository.AiContentCheckRepository;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.repository.PaymentSimulationRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.SupportAvailabilityRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import com.example.tpubpfe.util.TargetingGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Diffusion engine (contract §2.5): emergency first, then the support gate, eligible confirmed reservations,
 * score-based pool with equitable rotation, budget consumption and logging of every call.
 */
@Service
@RequiredArgsConstructor
public class DiffusionService {

    static final int EMERGENCY_DEFAULT_DURATION = 15;
    static final int SCORE_POOL_MARGIN = 5;
    static final DateTimeFormatter LOCAL_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final Set<CampaignStatus> DIFFUSABLE = Set.of(CampaignStatus.ACTIVE, CampaignStatus.VALIDATED_BY_ADMIN);

    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final EmergencyMessageRepository emergencyMessageRepository;
    private final MediaFileRepository mediaFileRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final SupportAvailabilityRepository blockRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final CampaignRepository campaignRepository;
    private final PaymentSimulationRepository paymentSimulationRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final EstimationService estimationService;
    private final FileStorageService storage;
    private final TpubProperties properties;
    private final Clock clock;

    /**
     * An eligible campaign with its first reservation, score and the unit cost of one diffusion under that
     * reservation (R1 unit cost × the reservation's price multiplier, docs/round2-contract.md §4.6).
     */
    record Candidate(Campaign campaign, Reservation reservation, int score, Instant lastDiffusion, BigDecimal unitCost) {
    }

    @Transactional
    public DiffusionResponse getNextAd(Long supportId, String zoneName, LocalDateTime requested) {
        if (supportId == null) {
            throw NetworkErrors.missingParameter("supportId", "Paramètre obligatoire : supportId.");
        }
        DiffusionSupport support = supportRepository.findById(supportId).orElseThrow(NetworkErrors::supportNotFound);
        if (zoneName != null && !zoneName.isBlank() && !zoneName.trim().equalsIgnoreCase(support.getZone().getName())) {
            throw NetworkErrors.supportZoneMismatch();
        }
        LocalDateTime dateTime = (requested != null ? requested : LocalDateTime.now(clock)).withNano(0);
        LocalDate date = dateTime.toLocalDate();
        LocalTime time = dateTime.toLocalTime();
        Instant at = dateTime.atZone(clock.getZone()).toInstant();

        // 1. emergency
        Optional<EmergencyMessage> emergency = selectEmergency(emergencyMessageRepository.findActiveOnDate(date), support, dateTime);
        if (emergency.isPresent()) {
            EmergencyMessage message = emergency.get();
            int duration = message.getDurationSeconds() != null ? message.getDurationSeconds() : EMERGENCY_DEFAULT_DURATION;
            DiffusionLog log = saveLog(support, null, message, null, DiffusionContentType.URGENCE, message.getTitle(),
                    null, duration, message.getPriority(), BigDecimal.ZERO, at);
            return DiffusionResponse.builder()
                    .type("urgence")
                    .diffusionLogId(log.getId())
                    .supportId(support.getId())
                    .emergencyId(message.getId())
                    .title(message.getTitle())
                    .content(message.getContent())
                    .duration(duration)
                    .zone(support.getZone().getName())
                    .priority((int) message.getPriority())
                    .urgencyLevel(message.getUrgencyLevel().name())
                    .datetime(LOCAL_DATE_TIME.format(dateTime))
                    .build();
        }

        // 2. support gate, 3-5. candidates and rotation
        if (supportOpen(support, blockRepository.findBySupportIdAndAvailabilityDate(support.getId(), date), time)) {
            List<Candidate> candidates = candidates(support, dateTime, at);
            Optional<Candidate> chosen = pick(candidates);
            if (chosen.isPresent()) {
                return diffuseAd(support, chosen.get(), dateTime, at);
            }
        }

        // 7. default content
        TpubProperties.Diffusion config = properties.getDiffusion();
        String mediaUrl = config.getDefaultMediaUrl() == null || config.getDefaultMediaUrl().isBlank()
                ? null : config.getDefaultMediaUrl();
        int duration = config.getDefaultDurationSeconds();
        DiffusionLog log = saveLog(support, null, null, null, DiffusionContentType.DEFAUT, config.getDefaultTitle(),
                mediaUrl, duration, (short) 0, BigDecimal.ZERO, at);
        return DiffusionResponse.builder()
                .type("defaut")
                .diffusionLogId(log.getId())
                .supportId(support.getId())
                .title(config.getDefaultTitle())
                .content(config.getDefaultContent())
                .mediaUrl(mediaUrl)
                .duration(duration)
                .zone(support.getZone().getName())
                .priority(0)
                .datetime(LOCAL_DATE_TIME.format(dateTime))
                .build();
    }

    private DiffusionResponse diffuseAd(DiffusionSupport support, Candidate candidate, LocalDateTime dateTime,
                                        Instant at) {
        Campaign campaign = candidate.campaign();
        BigDecimal unitCost = candidate.unitCost();
        MediaFile media = mediaFileRepository.findByCampaignIdOrderBySortOrderAscIdAsc(campaign.getId()).stream()
                .findFirst().orElse(null);
        String mediaUrl = media != null ? MediaService.publicUrl(storage, media.getFilePath()) : null;
        int duration = media != null && media.getFileType() == MediaFileType.VIDEO && media.getDurationSeconds() != null
                ? media.getDurationSeconds()
                : properties.getDiffusion().getDefaultDurationSeconds();

        BigDecimal consumed = campaign.getConsumedBudget() == null ? BigDecimal.ZERO : campaign.getConsumedBudget();
        campaign.setConsumedBudget(consumed.add(unitCost));
        campaignRepository.save(campaign);
        paymentSimulationRepository.findTopByCampaignIdOrderByCreatedAtDescIdDesc(campaign.getId()).ifPresent(payment -> {
            BigDecimal paid = payment.getBudgetConsumed() == null ? BigDecimal.ZERO : payment.getBudgetConsumed();
            payment.setBudgetConsumed(paid.add(unitCost));
            paymentSimulationRepository.save(payment);
        });

        DiffusionLog log = saveLog(support, campaign, null, candidate.reservation(), DiffusionContentType.PUBLICITE,
                campaign.getName(), media != null ? storage.canonicalUrl(media.getFilePath()) : null, duration,
                (short) candidate.score(), unitCost, at);
        return DiffusionResponse.builder()
                .type("publicite")
                .diffusionLogId(log.getId())
                .supportId(support.getId())
                .campaignId(campaign.getId())
                .title(campaign.getName())
                .content(null)
                .mediaUrl(mediaUrl)
                .mediaType(media != null ? media.getFileType().name() : null)
                .duration(duration)
                .zone(support.getZone().getName())
                .priority(candidate.score())
                .datetime(LOCAL_DATE_TIME.format(dateTime))
                .build();
    }

    List<Candidate> candidates(DiffusionSupport support, LocalDateTime dateTime, Instant at) {
        LocalDate date = dateTime.toLocalDate();
        LocalTime time = dateTime.toLocalTime();
        Map<Long, Reservation> firstByCampaign = new LinkedHashMap<>();
        reservationRepository.findActiveReservationsForSupportAt(support.getId(), date, time, ReservationStatus.CONFIRMEE)
                .stream()
                .sorted(Comparator.comparing(Reservation::getId))
                .forEach(r -> firstByCampaign.putIfAbsent(r.getCampaign().getId(), r));

        int maxPerHour = properties.getDiffusion().getMaxPerHour();
        List<Candidate> result = new ArrayList<>();
        for (Reservation reservation : firstByCampaign.values()) {
            Campaign campaign = reservation.getCampaign();
            BigDecimal unitCost = estimationService.unitCost(support, reservation);
            if (!isCampaignEligible(campaign, date, time, unitCost)) {
                continue;
            }
            if (!supportInsideCampaignZones(support, campaignZoneRepository.findByCampaignId(campaign.getId()))) {
                continue;
            }
            long recent = diffusionLogRepository.countInWindow(DiffusionContentType.PUBLICITE, campaign.getId(),
                    support.getId(), at.minus(Duration.ofMinutes(60)), at);
            if (recent >= maxPerHour) {
                continue;
            }
            Integer quality = aiContentCheckRepository
                    .findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(campaign.getId())
                    .map(AiContentCheck::getQualityScore)
                    .map(Number::intValue)
                    .orElse(null);
            Instant last = diffusionLogRepository.findLastDiffusion(DiffusionContentType.PUBLICITE, campaign.getId(),
                    support.getId());
            result.add(new Candidate(campaign, reservation, score(campaign.getPriorityScore(), quality), last, unitCost));
        }
        return result;
    }

    // --- pure rules (unit-tested) --------------------------------------------------------------------------------

    /** Active emergency covering {@code dateTime} and targeting the support; highest urgency first. */
    static Optional<EmergencyMessage> selectEmergency(List<EmergencyMessage> messages, DiffusionSupport support,
                                                      LocalDateTime dateTime) {
        return messages.stream()
                .filter(e -> Boolean.TRUE.equals(e.getIsActive()))
                .filter(e -> !dateTime.isBefore(startAt(e)) && !dateTime.isAfter(endAt(e)))
                .filter(e -> targets(e, support))
                .min(Comparator.comparingInt((EmergencyMessage e) -> -urgencyRank(e.getUrgencyLevel()))
                        .thenComparing(e -> e.getPriority() == null ? Short.MAX_VALUE : e.getPriority())
                        .thenComparing(EmergencyMessage::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(EmergencyMessage::getId, Comparator.nullsLast(Comparator.reverseOrder())));
    }

    public static LocalDateTime startAt(EmergencyMessage e) {
        return e.getStartDate().atTime(e.getStartTime() != null ? e.getStartTime() : LocalTime.MIDNIGHT);
    }

    public static LocalDateTime endAt(EmergencyMessage e) {
        return e.getEndDate().atTime(e.getEndTime() != null ? e.getEndTime() : LocalTime.of(23, 59, 59));
    }

    /** Polygon &gt; circle &gt; zone (docs/round2-contract.md §4.4). */
    static boolean targets(EmergencyMessage e, DiffusionSupport support) {
        return TargetingGeometry.emergencyTargets(e, support);
    }

    static int urgencyRank(UrgencyLevel level) {
        if (level == null) {
            return 0;
        }
        return switch (level) {
            case CRITICAL -> 4;
            case HIGH -> 3;
            case MEDIUM -> 2;
            case LOW -> 1;
        };
    }

    /** ACTIF and not inside a blocking period on that day. */
    static boolean supportOpen(DiffusionSupport support, List<SupportAvailability> blocksOfDay, LocalTime time) {
        if (support.getTechnicalStatus() != TechnicalStatus.ACTIF) {
            return false;
        }
        return blocksOfDay.stream()
                .filter(b -> AvailabilityRules.BLOCKING.contains(b.getAvailabilityStatus()))
                .noneMatch(b -> !time.isBefore(b.getStartTime()) && time.isBefore(b.getEndTime()));
    }

    /** Status, admin and AI gates (override honoured), period and time, client, budget. */
    static boolean isCampaignEligible(Campaign c, LocalDate date, LocalTime time, BigDecimal unitCost) {
        if (!DIFFUSABLE.contains(c.getStatus()) || c.getAdminStatus() != CampaignAdminStatus.VALIDATED) {
            return false;
        }
        boolean aiOk = c.getAiStatus() == CampaignAiStatus.APPROVED
                || (c.getAiStatus() == CampaignAiStatus.REVIEW_REQUIRED && Boolean.TRUE.equals(c.getAiOverride()));
        if (!aiOk) {
            return false;
        }
        if (c.getStartDate() == null || c.getEndDate() == null || date.isBefore(c.getStartDate()) || date.isAfter(c.getEndDate())) {
            return false;
        }
        if ((c.getStartTime() != null && time.isBefore(c.getStartTime())) || (c.getEndTime() != null && !time.isBefore(c.getEndTime()))) {
            return false;
        }
        Client client = c.getClient();
        if (client == null || client.getValidationStatus() == ClientValidationStatus.REJECTED
                || client.getValidationStatus() == ClientValidationStatus.SUSPENDED
                || client.getUser() == null || !Boolean.TRUE.equals(client.getUser().getIsActive())) {
            return false;
        }
        BigDecimal budget = c.getBudget() == null ? BigDecimal.ZERO : c.getBudget();
        BigDecimal consumed = c.getConsumedBudget() == null ? BigDecimal.ZERO : c.getConsumedBudget();
        return budget.signum() > 0 && consumed.add(unitCost).compareTo(budget) <= 0;
    }

    /** Inside any circle or polygon of the campaign. */
    static boolean supportInsideCampaignZones(DiffusionSupport support, List<CampaignZone> zones) {
        return ReservationService.insideAnyCircle(support, zones);
    }

    /** {@code priorityScore × 10 + round(0.2 × quality)} (quality 0 when no check), 0..120. */
    static int score(Short priorityScore, Integer qualityScore) {
        int priority = priorityScore == null ? 0 : priorityScore;
        int quality = qualityScore == null ? 0 : qualityScore;
        return priority * 10 + (int) Math.round(0.2 * quality);
    }

    /**
     * Pool = candidates with score ≥ maxScore − 5; the one whose last diffusion on the support is the oldest wins
     * (never diffused first), ties broken by the lowest campaign id.
     */
    static Optional<Candidate> pick(List<Candidate> candidates) {
        if (candidates.isEmpty()) {
            return Optional.empty();
        }
        int maxScore = candidates.stream().mapToInt(Candidate::score).max().orElse(0);
        return candidates.stream()
                .filter(c -> c.score() >= maxScore - SCORE_POOL_MARGIN)
                .min(Comparator.comparing(Candidate::lastDiffusion, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(c -> c.campaign().getId()));
    }

    private DiffusionLog saveLog(DiffusionSupport support, Campaign campaign, EmergencyMessage emergency,
                                 Reservation reservation, DiffusionContentType type, String title, String mediaUrl,
                                 int duration, Short priority, BigDecimal cost, Instant at) {
        return diffusionLogRepository.save(DiffusionLog.builder()
                .support(support)
                .zone(support.getZone())
                .campaign(campaign)
                .emergency(emergency)
                .reservation(reservation)
                .contentType(type)
                .title(title == null ? null : (title.length() > 255 ? title.substring(0, 255) : title))
                .mediaUrl(mediaUrl)
                .durationSeconds(duration > 0 ? (short) duration : null)
                .priority(priority == null ? 0 : priority)
                .cost(cost)
                .diffusedAt(at)
                .build());
    }
}
