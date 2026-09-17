package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.dto.DuplicateRequest;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

/**
 * {@code POST /api/campaigns/{id}/duplicate}: new BROUILLON copy (content, budget, times, zones, optional media).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CampaignDuplicationService {

    static final String PREFIX = "Copie de ";
    static final int NAME_MAX = 200;

    private final CampaignRepository campaignRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final MediaFileRepository mediaFileRepository;
    private final CampaignAccessGuard accessGuard;
    private final CampaignMapper campaignMapper;
    private final FileStorageService fileStorageService;
    private final Clock clock;

    @Transactional
    public CampaignResponse duplicate(Long campaignId, DuplicateRequest request) {
        Campaign source = accessGuard.owned(campaignId);
        CampaignService.ensureClientAllowed(source.getClient());
        boolean includeMedia = request == null || request.getIncludeMedia() == null || request.getIncludeMedia();
        LocalDate today = LocalDate.now(clock);
        boolean keepDates = source.getStartDate() != null && !source.getStartDate().isBefore(today);

        Campaign copy = campaignRepository.save(Campaign.builder()
                .client(source.getClient())
                .name(copyName(source.getName()))
                .objective(source.getObjective())
                .budget(source.getBudget())
                .startDate(keepDates ? source.getStartDate() : null)
                .endDate(keepDates ? source.getEndDate() : null)
                .startTime(source.getStartTime())
                .endTime(source.getEndTime())
                .status(CampaignStatus.BROUILLON)
                .duplicatedFromId(source.getId())
                .build());

        List<CampaignZone> zones = campaignZoneRepository.findByCampaignIdOrderByIdAsc(source.getId()).stream()
                .map(zone -> CampaignZone.builder()
                        .campaign(copy)
                        .zone(zone.getZone())
                        .latitude(zone.getLatitude())
                        .longitude(zone.getLongitude())
                        .radiusKm(zone.getRadiusKm())
                        .label(zone.getLabel())
                        .build())
                .toList();
        campaignZoneRepository.saveAll(zones);

        if (includeMedia) {
            copyMedia(source, copy);
        }
        return campaignMapper.toResponse(copy);
    }

    static String copyName(String name) {
        String full = PREFIX + (name == null ? "" : name);
        return full.length() <= NAME_MAX ? full : full.substring(0, NAME_MAX);
    }

    private void copyMedia(Campaign source, Campaign copy) {
        List<MediaFile> media = mediaFileRepository.findByCampaignId(source.getId()).stream()
                .sorted(Comparator.comparing(MediaFile::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        for (MediaFile original : media) {
            String copiedPath;
            try {
                copiedPath = fileStorageService.copy(original.getFilePath(), "campaigns/" + copy.getId());
            } catch (RuntimeException ex) {
                log.warn("Média {} non copié lors de la duplication de la campagne {} : {}",
                        original.getId(), source.getId(), ex.getMessage());
                continue;
            }
            mediaFileRepository.save(MediaFile.builder()
                    .campaign(copy)
                    .fileName(original.getFileName())
                    .filePath(copiedPath)
                    .fileType(original.getFileType())
                    .mimeType(original.getMimeType())
                    .fileSizeBytes(original.getFileSizeBytes())
                    .durationSeconds(original.getDurationSeconds())
                    .checksum(original.getChecksum())
                    .build());
        }
    }
}
