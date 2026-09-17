package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EstimateResponse {

    private long days;
    private double hoursPerDay;
    private List<Line> lines;
    private long totalViews;
    private BigDecimal totalCost;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Line {
        private Long supportId;
        private String supportName;
        private String supportType;
        private String zoneName;
        private long estimatedViews;
        private BigDecimal estimatedCost;
    }
}
