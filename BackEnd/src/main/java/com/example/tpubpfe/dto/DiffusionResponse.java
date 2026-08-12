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

    private String type;
    private Long campaignId;
    private String title;
    private String mediaUrl;
    private Integer duration;
    private String zone;
    private Integer priority;
}
