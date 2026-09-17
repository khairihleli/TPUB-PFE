package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.realtime.SseHub;
import com.example.tpubpfe.service.supervision.SupervisionService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Pushes the supervision counters every minute, only when someone is watching (docs/round2-contract.md §5.3). */
@Component
@RequiredArgsConstructor
public class SupervisionStatsScheduler {

    private final SseHub hub;
    private final SupervisionService supervisionService;

    @Scheduled(fixedRate = 60_000L, initialDelay = 60_000L)
    public void runOnce() {
        if (hub.count(SseHub.Channel.SUPERVISION) == 0) {
            return;
        }
        hub.broadcast(SseHub.Channel.SUPERVISION, "stats", supervisionService.stats());
    }
}
