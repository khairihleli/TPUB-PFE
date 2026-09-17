package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.supervision.SupervisionService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Opens and resolves the zone saturation alerts (docs/round2-contract.md §5.3). */
@Component
@RequiredArgsConstructor
public class SaturationScheduler {

    private final SupervisionService supervisionService;

    @Scheduled(cron = "${tpub.supervision.saturation-cron:0 */5 * * * *}")
    public void runOnce() {
        supervisionService.evaluateSaturation();
    }
}
