package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.MediaFileType;

import java.nio.file.Path;

/**
 * Media metadata given to the analysis pipeline (decoupled from the JPA entity).
 *
 * @param path absolute path of the stored file, null when unknown (OCR then relies on the file name)
 */
public record MediaInput(
        Long id,
        String fileName,
        MediaFileType fileType,
        String mimeType,
        Long sizeBytes,
        Integer durationSeconds,
        Integer widthPx,
        Integer heightPx,
        String checksum,
        Path path
) {

    public boolean isVideo() {
        return fileType == MediaFileType.VIDEO;
    }

    public boolean isImage() {
        return fileType == MediaFileType.IMAGE || fileType == MediaFileType.BANNER;
    }
}
