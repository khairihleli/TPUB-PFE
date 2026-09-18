package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaFileResponse {

    private Long id;
    private Long campaignId;
    private String fileName;
    private String fileType;
    private String mimeType;
    private Long fileSizeBytes;
    private Integer durationSeconds;
    private Integer widthPx;
    private Integer heightPx;
    /** Public URL, e.g. {@code /uploads/campaigns/12/<uuid>.jpg}. */
    private String url;
    private String checksum;
    private Integer sortOrder;
    private Instant createdAt;
}
