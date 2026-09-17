package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.supervision.PresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Marks silent players offline (docs/round2-contract.md §5.2). */
@Component
@RequiredArgsConstructor
public class PresenceScheduler {

    private final PresenceService presenceService;

    @Scheduled(cron = "${tpub.supervision.presence-check-cron:*/15 * * * * *}")
    public void runOnce() {
        presenceService.sweep();
    }
}
