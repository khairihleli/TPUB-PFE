package com.example.tpubpfe.service.ai.media;

import java.awt.image.BufferedImage;
import java.nio.file.Path;

/** Writes video thumbnails (docs/round2-contract.md §1.2). */
@FunctionalInterface
public interface ThumbnailStore {

    int MAX_WIDTH = 480;

    static String relativePath(Long campaignId, Long mediaId) {
        return "campaigns/" + campaignId + "/thumbs/" + mediaId + ".jpg";
    }

    /**
     * Writes the thumbnail when absent or older than the media file.
     *
     * @return the relative storage path, or null when it could not be written
     */
    String store(Long campaignId, Long mediaId, Path mediaFile, BufferedImage frame);
}
