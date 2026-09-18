package com.example.zelqanepfe.dto;

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
public class ZoneRecommendationResponse {

    private ZoneResponse zone;
    private int score;
    private long totalSupports;
    private long availableSupports;
    private long estimatedViewsAvailable;
    private BigDecimal estimatedCostAvailable;
    private double recentViewsPerSupport;
    private List<String> reasons;
}
