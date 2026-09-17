package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.AiIssue;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiIssuesResponse {
    private Long campaignId;
    private Long checkId;
    private String aiStatus;
    private List<AiIssue> issues;
}
