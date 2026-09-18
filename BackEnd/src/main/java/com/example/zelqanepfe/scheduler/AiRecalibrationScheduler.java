package com.example.zelqanepfe.scheduler;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.model.AiCalibration;
import com.example.zelqanepfe.service.ai.learning.AiCalibrationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly recalibration of the AI thresholds and rule weights (docs/round2-contract.md §2.7), trigger PLANIFIE.
 * Runs only when scheduling is enabled ({@code zelqane.scheduler.enabled}) and learning is on.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiRecalibrationScheduler {

    private final AiCalibrationService calibrationService;
    private final AiAnalysisProperties properties;

    @Scheduled(cron = "${zelqane.analysis.learning.cron:0 30 3 * * *}", zone = "${zelqane.timezone:Africa/Tunis}")
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
