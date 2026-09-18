package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.CampaignResponse;
import com.example.zelqanepfe.dto.CampaignZoneResponse;
import com.example.zelqanepfe.model.AiContentCheck;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.MediaFile;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.ZoneGeometryType;
import com.example.zelqanepfe.repository.AiContentCheckRepository;
import com.example.zelqanepfe.repository.CampaignZoneRepository;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.MediaFileRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.service.storage.FileStorageService;
import com.example.zelqanepfe.util.TargetingGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Builds the full {@link CampaignResponse} (contract §2.1). Reads media, reservations, zones and AI checks.
 */
@Component
@RequiredArgsConstructor
public class CampaignMapper {

    static final Set<ReservationStatus> LIVE_RESERVATIONS = Set.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);

    private final MediaFileRepository mediaFileRepository;
    private final ReservationRepository reservationRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final DiffusionSupportRepository supportRepository;
    private final FileStorageService fileStorageService;

    public CampaignResponse toResponse(Campaign campaign) {
        return toResponse(campaign, supportRepository.findAll());
    }

    public List<CampaignResponse> toResponses(List<Campaign> campaigns) {
        if (campaigns.isEmpty()) {
            return List.of();
        }
        List<DiffusionSupport> supports = supportRepository.findAll();
        return campaigns.stream().map(campaign -> toResponse(campaign, supports)).toList();
    }

    public List<CampaignZoneResponse> toZoneResponses(List<CampaignZone> zones) {
        List<DiffusionSupport> supports = zones.isEmpty() ? List.of() : supportRepository.findAll();
        return zones.stream().map(zone -> toZoneResponse(zone, supports)).toList();
    }

    CampaignResponse toResponse(Campaign campaign, List<DiffusionSupport> supports) {
        Client client = campaign.getClient();
        List<MediaFile> media = mediaFileRepository.findByCampaignId(campaign.getId()).stream()
                .sorted(Comparator.comparing(MediaFile::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        List<Reservation> live = reservationRepository.findByCampaignId(campaign.getId()).stream()
                .filter(r -> LIVE_RESERVATIONS.contains(r.getReservationStatus()))
                .toList();
        BigDecimal estimatedCost = live.stream()
                .map(r -> r.getEstimatedCost() == null ? BigDecimal.ZERO : r.getEstimatedCost())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<CampaignZoneResponse> zones = campaignZoneRepository.findByCampaignIdOrderByIdAsc(campaign.getId()).stream()
                .map(zone -> toZoneResponse(zone, supports))
                .toList();
        AiContentCheck check = campaign.getId() == null ? null
                : aiContentCheckRepository.findTopByCampaignIdAndIsPreviewFalseOrderByCheckedAtDescIdDesc(campaign.getId())
                .orElse(null);
        BigDecimal budget = campaign.getBudget() == null ? BigDecimal.ZERO : campaign.getBudget();
        BigDecimal consumed = campaign.getConsumedBudget() == null ? BigDecimal.ZERO : campaign.getConsumedBudget();
        MediaFile first = media.isEmpty() ? null : media.get(0);

        return CampaignResponse.builder()
                .id(campaign.getId())
                .clientId(client != null ? client.getId() : null)
                .clientName(client != null && client.getUser() != null ? client.getUser().getNom() : null)
                .clientCompanyName(client != null ? client.getCompanyName() : null)
                .clientValidationStatus(client != null && client.getValidationStatus() != null
                        ? client.getValidationStatus().name() : null)
                .name(campaign.getName())
                .objective(campaign.getObjective())
                .budget(budget)
                .consumedBudget(consumed)
                .remainingBudget(budget.subtract(consumed).max(BigDecimal.ZERO))
                .estimatedCost(estimatedCost)
                .status(campaign.getStatus() != null ? campaign.getStatus().name() : null)
                .aiStatus(campaign.getAiStatus() != null ? campaign.getAiStatus().name() : null)
                .adminStatus(campaign.getAdminStatus() != null ? campaign.getAdminStatus().name() : null)
                .aiOverride(Boolean.TRUE.equals(campaign.getAiOverride()))
                .startDate(campaign.getStartDate())
                .endDate(campaign.getEndDate())
                .startTime(campaign.getStartTime())
                .endTime(campaign.getEndTime())
                .estimatedViews(campaign.getEstimatedViews())
                .priorityScore(campaign.getPriorityScore())
                .aiRiskScore(check != null ? check.getRiskScore().intValue() : null)
                .aiQualityScore(check != null ? check.getQualityScore().intValue() : null)
                .aiSector(check != null && check.getSector() != null ? check.getSector().name() : null)
                .rejectionReason(campaign.getRejectionReason())
                .adminComment(campaign.getAdminComment())
                .terminationReason(campaign.getTerminationReason() != null ? campaign.getTerminationReason().name() : null)
                .mediaUrl(first != null ? mediaUrl(first) : null)
                .mediaType(first != null && first.getFileType() != null ? first.getFileType().name() : null)
                .mediaCount(media.size())
                .zones(zones)
                .reservationsCount(live.size())
                .duplicatedFromId(campaign.getDuplicatedFromId())
                .editable(CampaignLifecycle.acceptsUpdate(campaign.getStatus()))
                .submittable(CampaignLifecycle.isSubmittable(campaign.getStatus()))
                .deletable(CampaignLifecycle.isDeletable(campaign.getStatus()))
                .createdAt(campaign.getCreatedAt())
                .updatedAt(campaign.getUpdatedAt())
                .submittedAt(campaign.getSubmittedAt())
                .validatedAt(campaign.getValidatedAt())
                .activatedAt(campaign.getActivatedAt())
                .terminatedAt(campaign.getTerminatedAt())
                .build();
    }

    CampaignZoneResponse toZoneResponse(CampaignZone zone, List<DiffusionSupport> supports) {
        long inside = supports.stream()
                .filter(s -> TargetingGeometry.inside(s, zone))
                .count();
        ZoneGeometryType type = zone.getGeometryType() == null ? ZoneGeometryType.CERCLE : zone.getGeometryType();
        return CampaignZoneResponse.builder()
                .id(zone.getId())
                .zoneId(zone.getZone() != null ? zone.getZone().getId() : null)
                .zoneName(zone.getZone() != null ? zone.getZone().getName() : null)
                .label(zone.getLabel())
                .type(type.name())
                .latitude(zone.getLatitude())
                .longitude(zone.getLongitude())
                .radiusKm(zone.getRadiusKm())
                .polygon(type == ZoneGeometryType.POLYGONE ? zone.getPolygon() : null)
                .areaKm2(zone.getAreaKm2() != null ? zone.getAreaKm2() : CampaignZoneService.circleArea(zone.getRadiusKm()))
                .supportsInside(inside)
                .build();
    }

    private String mediaUrl(MediaFile media) {
        String path = media.getFilePath();
        if (path == null || path.isBlank()) {
            return null;
        }
        if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
            return path;
        }
        return fileStorageService.publicUrl(path);
    }
}
