package com.example.zelqanepfe.service.realtime;

import com.example.zelqanepfe.service.supervision.DiffusionFeedService;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Broadcasts realtime events after commit, on a dedicated single thread, so a slow client never blocks a request
 * thread (docs/round2-contract.md §5.3).
 */
@Slf4j
@Component
public class RealtimeRelay {

    private final SseHub hub;
    private final DiffusionFeedService diffusionFeed;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "zelqane-realtime");
        thread.setDaemon(true);
        return thread;
    });

    public RealtimeRelay(SseHub hub, DiffusionFeedService diffusionFeed) {
        this.hub = hub;
        this.diffusionFeed = diffusionFeed;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onSupervisionEvent(SupervisionBroadcastEvent event) {
        run(ignored -> hub.broadcast(SseHub.Channel.SUPERVISION, event.event(), event.payload()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onNotification(NotificationPushEvent event) {
        run(ignored -> diffusionFeed.pushNotification(event));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onDiffusion(DiffusionRecordedEvent event) {
        run(ignored -> diffusionFeed.handle(event));
    }

    private void run(Consumer<Void> task) {
        try {
            executor.execute(() -> {
                try {
                    task.accept(null);
                } catch (RuntimeException e) {
                    log.warn("Diffusion temps réel impossible : {}", e.getMessage());
                }
            });
        } catch (RuntimeException e) {
            log.warn("File temps réel indisponible : {}", e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
