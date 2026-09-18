package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.dto.MediaFileResponse;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.MediaFile;
import com.example.zelqanepfe.model.MediaFileType;
import com.example.zelqanepfe.repository.MediaFileRepository;
import com.example.zelqanepfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Campaign media upload, listing and deletion (contract §2.3).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {

    static final Map<String, String> IMAGE_TYPES = Map.of(
            "image/jpeg", "jpg", "image/png", "png", "image/webp", "webp", "image/gif", "gif");
    static final Map<String, String> VIDEO_TYPES = Map.of("video/mp4", "mp4", "video/webm", "webm");
    private static final int SNIFF_BYTES = 16;

    private final MediaFileRepository mediaFileRepository;
    private final CampaignAccessGuard accessGuard;
    private final FileStorageService storage;
    private final ZelqaneProperties properties;

    @Transactional(readOnly = true)
    public List<MediaFileResponse> list(Long campaignId) {
        Campaign campaign = accessGuard.readable(campaignId);
        return mediaFileRepository.findByCampaignIdOrderBySortOrderAscIdAsc(campaign.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public MediaFileResponse upload(Long campaignId, MultipartFile file, String kind, Integer durationSeconds) {
        Campaign campaign = accessGuard.owned(campaignId);
        CampaignService.ensureClientAllowed(campaign.getClient());
        if (campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw CampaignErrors.notEditable();
        }
        if (file == null || file.isEmpty()) {
            throw NetworkErrors.missingParameter("file", "Fichier obligatoire.");
        }
        String declared = normaliseMime(file.getContentType());
        boolean image = IMAGE_TYPES.containsKey(declared);
        boolean video = VIDEO_TYPES.containsKey(declared);
        if (!image && !video) {
            throw NetworkErrors.mediaTypeUnsupported();
        }
        MediaFileType type = resolveType(image, kind);
        String sniffed = sniff(file).orElseThrow(NetworkErrors::mediaContentMismatch);
        if (!family(sniffed).equals(family(declared))) {
            throw NetworkErrors.mediaContentMismatch();
        }
        long max = image ? properties.getMedia().getMaxImageBytes() : properties.getMedia().getMaxVideoBytes();
        if (file.getSize() > max) {
            throw NetworkErrors.mediaTooLarge(max);
        }
        long count = mediaFileRepository.countByCampaignId(campaign.getId());
        if (count >= properties.getMedia().getMaxFilesPerCampaign()) {
            throw NetworkErrors.mediaLimitReached(properties.getMedia().getMaxFilesPerCampaign());
        }
        Short duration = null;
        if (video && durationSeconds != null) {
            if (durationSeconds < 1 || durationSeconds > 600) {
                throw CampaignErrors.validationFailed("durationSeconds", "La durée doit être comprise entre 1 et 600 secondes.");
            }
            duration = durationSeconds.shortValue();
        }

        String extension = image ? IMAGE_TYPES.get(sniffed) : VIDEO_TYPES.get(sniffed);
        String directory = "campaigns/" + campaign.getId();
        FileStorageService.StoredFile stored = storage.store(file, directory, extension);
        registerRollbackCleanup(stored.relativePath());
        Integer width = null;
        Integer height = null;
        if (image) {
            int[] size = readDimensions(storage.resolve(stored.relativePath()));
            if (size != null) {
                width = size[0];
                height = size[1];
            }
        }
        MediaFile media = mediaFileRepository.save(MediaFile.builder()
                .campaign(campaign)
                .fileName(originalName(file.getOriginalFilename(), extension))
                .filePath(stored.relativePath())
                .fileType(type)
                .mimeType(sniffed)
                .fileSizeBytes(stored.sizeBytes())
                .durationSeconds(duration)
                .checksum(stored.sha256())
                .widthPx(width)
                .heightPx(height)
                .sortOrder((short) count)
                .build());
        return toResponse(media);
    }

    @Transactional
    public void delete(Long campaignId, Long mediaId) {
        Campaign campaign = accessGuard.owned(campaignId);
        MediaFile media = mediaFileRepository.findById(mediaId)
                .filter(m -> Objects.equals(m.getCampaign().getId(), campaign.getId()))
                .orElseThrow(NetworkErrors::mediaNotFound);
        CampaignService.ensureClientAllowed(campaign.getClient());
        if (campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw CampaignErrors.notEditable();
        }
        String path = media.getFilePath();
        mediaFileRepository.delete(media);
        afterCommit(() -> {
            if (path != null && !path.startsWith("http://") && !path.startsWith("https://")) {
                storage.delete(path);
            }
        });
    }

    static MediaFileType resolveType(boolean image, String kind) {
        if (kind == null || kind.isBlank()) {
            return image ? MediaFileType.IMAGE : MediaFileType.VIDEO;
        }
        String normalised = kind.trim().toUpperCase(Locale.ROOT);
        if ("BANNER".equals(normalised)) {
            if (!image) {
                throw CampaignErrors.validationFailed("kind", "Une bannière doit être une image.");
            }
            return MediaFileType.BANNER;
        }
        if ("IMAGE".equals(normalised) && image) {
            return MediaFileType.IMAGE;
        }
        if ("VIDEO".equals(normalised) && !image) {
            return MediaFileType.VIDEO;
        }
        throw CampaignErrors.invalidParameter("kind", "Valeur invalide pour kind : " + kind);
    }

    static String family(String mime) {
        int slash = mime.indexOf('/');
        return slash < 0 ? mime : mime.substring(0, slash);
    }

    static String normaliseMime(String contentType) {
        if (contentType == null) {
            return "";
        }
        String value = contentType.toLowerCase(Locale.ROOT).trim();
        int semicolon = value.indexOf(';');
        value = semicolon >= 0 ? value.substring(0, semicolon).trim() : value;
        return "image/jpg".equals(value) || "image/pjpeg".equals(value) ? "image/jpeg" : value;
    }

    static String originalName(String original, String extension) {
        String name = original == null ? "" : original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        if (name.isEmpty()) {
            name = "media." + extension;
        }
        return name.length() > 255 ? name.substring(name.length() - 255) : name;
    }

    private static Optional<String> sniff(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            return FileStorageService.sniffMime(in.readNBytes(SNIFF_BYTES));
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    private static int[] readDimensions(Path path) {
        try {
            BufferedImage image = ImageIO.read(path.toFile());
            return image == null ? null : new int[]{image.getWidth(), image.getHeight()};
        } catch (IOException | RuntimeException ex) {
            return null;
        }
    }

    private void registerRollbackCleanup(String relativePath) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    storage.delete(relativePath);
                }
            }
        });
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        action.run();
                    } catch (RuntimeException ex) {
                        log.warn("Suppression du fichier média impossible : {}", ex.getMessage());
                    }
                }
            });
        } else {
            action.run();
        }
    }

    MediaFileResponse toResponse(MediaFile media) {
        return MediaFileResponse.builder()
                .id(media.getId())
                .campaignId(media.getCampaign().getId())
                .fileName(media.getFileName())
                .fileType(media.getFileType().name())
                .mimeType(media.getMimeType())
                .fileSizeBytes(media.getFileSizeBytes())
                .durationSeconds(media.getDurationSeconds() != null ? media.getDurationSeconds().intValue() : null)
                .widthPx(media.getWidthPx())
                .heightPx(media.getHeightPx())
                .url(publicUrl(storage, media.getFilePath()))
                .checksum(media.getChecksum())
                .sortOrder(media.getSortOrder() != null ? media.getSortOrder().intValue() : 0)
                .createdAt(media.getCreatedAt())
                .build();
    }

    /** Absolute or rooted paths are returned as-is (legacy rows); relative storage paths become public URLs. */
    public static String publicUrl(FileStorageService storage, String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
            return path;
        }
        return storage.publicUrl(path);
    }
}
