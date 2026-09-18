package com.example.zelqanepfe.service.ai.media;

import com.example.zelqanepfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Thumbnails under the upload root: {@code campaigns/{campaignId}/thumbs/{mediaId}.jpg}, JPEG q0.85, ≤ 480 px wide. */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileThumbnailStore implements ThumbnailStore {

    private final FileStorageService storage;

    @Override
    public String store(Long campaignId, Long mediaId, Path mediaFile, BufferedImage frame) {
        if (campaignId == null || mediaId == null || frame == null) {
            return null;
        }
        String relative = ThumbnailStore.relativePath(campaignId, mediaId);
        try {
            Path target = storage.resolve(relative);
            if (Files.isRegularFile(target) && (mediaFile == null || !Files.isRegularFile(mediaFile)
                    || Files.getLastModifiedTime(target).compareTo(Files.getLastModifiedTime(mediaFile)) >= 0)) {
                return relative;
            }
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), "thumb-", ".tmp");
            try (OutputStream out = Files.newOutputStream(temp)) {
                JpegEncoder.write(JpegEncoder.fitWidth(frame, MAX_WIDTH), out);
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            return relative;
        } catch (Exception ex) {
            log.warn("Miniature de la vidéo {} impossible à écrire : {}", mediaId, ex.getMessage());
            return null;
        }
    }
}
