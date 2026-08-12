package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.DiffusionResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAdminStatus;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DiffusionService {

    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final EmergencyMessageRepository emergencyMessageRepository;
    private final MediaFileRepository mediaFileRepository;
    private final DiffusionLogRepository diffusionLogRepository;

    @Transactional
    public DiffusionResponse getNextAd(Long supportId, String zoneName, LocalDateTime dateTime) {
        DiffusionSupport support = supportRepository.findById(supportId)
                .orElseThrow(() -> new ResourceNotFoundException("Support not found: " + supportId));

        LocalDate date = dateTime.toLocalDate();
        LocalTime time = dateTime.toLocalTime();
        Long zoneId = support.getZone().getId();

        List<EmergencyMessage> emergencies = emergencyMessageRepository.findActiveForZoneOnDate(zoneId, date);
        if (!emergencies.isEmpty()) {
            EmergencyMessage emergency = emergencies.get(0);
            DiffusionResponse response = DiffusionResponse.builder()
                    .type("urgence")
                    .campaignId(null)
                    .title(emergency.getTitle())
                    .mediaUrl(null)
                    .duration(emergency.getDurationSeconds() != null ? emergency.getDurationSeconds().intValue() : 15)
                    .zone(support.getZone().getName())
                    .priority(emergency.getPriority().intValue())
                    .build();
            logDiffusion(support, null, support.getZone().getId(), emergency, response);
            return response;
        }

        List<Reservation> reservations = reservationRepository.findActiveReservationsForSupportAt(
                supportId, date, time, ReservationStatus.CONFIRMEE);

        List<Campaign> eligibleCampaigns = reservations.stream()
                .map(Reservation::getCampaign)
                .filter(this::isDiffusionEligible)
                .sorted(Comparator.comparing(Campaign::getPriorityScore).reversed())
                .toList();

        if (eligibleCampaigns.isEmpty()) {
            DiffusionResponse response = DiffusionResponse.builder()
                    .type("defaut")
                    .title("TPUB - Contenu par defaut")
                    .mediaUrl(null)
                    .duration(10)
                    .zone(support.getZone().getName())
                    .priority(0)
                    .build();
            logDiffusion(support, null, zoneId, null, response);
            return response;
        }

        Campaign campaign = eligibleCampaigns.get(0);
        MediaFile media = mediaFileRepository.findByCampaignId(campaign.getId()).stream()
                .findFirst()
                .orElse(null);

        DiffusionResponse response = DiffusionResponse.builder()
                .type("publicite")
                .campaignId(campaign.getId())
                .title(campaign.getName())
                .mediaUrl(media != null ? media.getFilePath() : null)
                .duration(10)
                .zone(support.getZone().getName())
                .priority(campaign.getPriorityScore().intValue())
                .build();

        logDiffusion(support, campaign, zoneId, null, response);
        return response;
    }

    private boolean isDiffusionEligible(Campaign campaign) {
        return campaign.getAiStatus() == CampaignAiStatus.APPROVED
                && campaign.getAdminStatus() == CampaignAdminStatus.VALIDATED
                && (campaign.getStatus() == CampaignStatus.ACTIVE
                || campaign.getStatus() == CampaignStatus.VALIDATED_BY_ADMIN);
    }

    private void logDiffusion(
            DiffusionSupport support,
            Campaign campaign,
            Long zoneId,
            EmergencyMessage emergency,
            DiffusionResponse response
    ) {
        DiffusionContentType contentType = switch (response.getType()) {
            case "urgence" -> DiffusionContentType.URGENCE;
            case "defaut" -> DiffusionContentType.DEFAUT;
            default -> DiffusionContentType.PUBLICITE;
        };

        diffusionLogRepository.save(DiffusionLog.builder()
                .support(support)
                .campaign(campaign)
                .zone(support.getZone())
                .emergency(emergency)
                .contentType(contentType)
                .title(response.getTitle())
                .mediaUrl(response.getMediaUrl())
                .durationSeconds(response.getDuration() != null ? response.getDuration().shortValue() : null)
                .priority(response.getPriority() != null ? response.getPriority().shortValue() : 0)
                .build());
    }
}
