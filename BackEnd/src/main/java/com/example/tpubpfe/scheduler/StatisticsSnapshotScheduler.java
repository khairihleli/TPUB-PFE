package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.StatisticsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Upserts today's platform statistics row every 15 minutes (contract §2.9).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StatisticsSnapshotScheduler {

    private final StatisticsService statisticsService;

    @Scheduled(cron = "0 */15 * * * *")
    public void runOnce() {
        try {
            statisticsService.snapshotToday();
        } catch (RuntimeException ex) {
            log.warn("Instantané statistique impossible : {}", ex.getMessage());
        }
    }
}
