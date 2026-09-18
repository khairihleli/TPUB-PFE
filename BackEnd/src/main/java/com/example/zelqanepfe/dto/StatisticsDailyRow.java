package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One zero-filled day of measured diffusion figures. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatisticsDailyRow {

    private LocalDate date;
    private long views;
    private long clicks;
    private long interactions;
    private BigDecimal cost;
}
