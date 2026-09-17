package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiffusionResponse {

    /** {@code publicite}, {@code urgence} or {@code defaut}. */
    private String type;
    private Long diffusionLogId;
    private Long supportId;
    private Long campaignId;
    private Long emergencyId;
    private String title;
    private String content;
    private String mediaUrl;
    private String mediaType;
    private Integer duration;
    private String zone;
    private Integer priority;
    private String urgencyLevel;
    /** Local date-time used for the selection, {@code YYYY-MM-DDTHH:mm:ss}. */
    private String datetime;
}
