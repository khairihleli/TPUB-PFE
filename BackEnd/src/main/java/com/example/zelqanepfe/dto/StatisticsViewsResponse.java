package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * {@code GET /api/statistics/views} (contract §2.9).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatisticsViewsResponse {

    private LocalDate from;
    private LocalDate to;
    private String groupBy;
    private List<Row> rows;
    private Totals totals;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Row {
        private String key;
        private String label;
        private long views;
        private long clicks;
        private long interactions;
        private BigDecimal cost;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Totals {
        private long views;
        private long clicks;
        private long interactions;
        private BigDecimal cost;
    }
}
