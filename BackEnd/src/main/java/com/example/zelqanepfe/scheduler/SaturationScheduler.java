package com.example.zelqanepfe.scheduler;

import com.example.zelqanepfe.service.supervision.SupervisionService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Opens and resolves the zone saturation alerts (docs/round2-contract.md §5.3). */
@Component
@RequiredArgsConstructor
public class SaturationScheduler {

    private final SupervisionService supervisionService;

    @Scheduled(cron = "${zelqane.supervision.saturation-cron:0 */5 * * * *}")
    public void runOnce() {
        supervisionService.evaluateSaturation();
    }
}
