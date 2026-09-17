package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.config.AiAnalysisProperties;
import com.example.tpubpfe.model.AiCalibration;
import com.example.tpubpfe.service.ai.learning.AiCalibrationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly recalibration of the AI thresholds and rule weights (docs/round2-contract.md §2.7), trigger PLANIFIE.
 * Runs only when scheduling is enabled ({@code tpub.scheduler.enabled}) and learning is on.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiRecalibrationScheduler {

    private final AiCalibrationService calibrationService;
    private final AiAnalysisProperties properties;

    @Scheduled(cron = "${tpub.analysis.learning.cron:0 30 3 * * *}", zone = "${tpub.timezone:Africa/Tunis}")
    public void runOnce() {
        if (!properties.getLearning().isEnabled()) {
            return;
        }
        try {
            calibrationService.recalibrate(AiCalibration.Trigger.PLANIFIE);
        } catch (RuntimeException ex) {
            log.warn("Recalibration IA planifiée impossible : {}", ex.getMessage());
        }
    }
}
