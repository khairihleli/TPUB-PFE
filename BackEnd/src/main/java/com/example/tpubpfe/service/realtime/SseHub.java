package com.example.tpubpfe.service.realtime;

import com.example.tpubpfe.config.SupervisionProperties;
import com.example.tpubpfe.exception.ApiException;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Registry of the open Server-Sent Events streams (docs/round2-contract.md §5.3): one emitter per browser tab,
 * monotonic event ids, a {@code : ping} comment every {@code keepalive-seconds} and removal of every failed send.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SseHub {

    /** Streams served by {@code /api/realtime/**}. */
    public enum Channel { SUPERVISION, NOTIFICATIONS }

    private record Client(String id, Channel channel, Long userId, SseEmitter emitter) {
    }

    private final SupervisionProperties.Supervision properties;
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();
    private final AtomicLong clientIds = new AtomicLong();
    private volatile ScheduledExecutorService keepalive;

    /**
     * Opens a stream. The caller sends the first event ({@code snapshot} or {@code unread-count}) itself.
     *
     * @throws ApiException 503 {@code REALTIME_CAPACITY_REACHED} when too many streams are already open
     */
    public SseEmitter open(Channel channel, Long userId) {
        if (clients.size() >= properties.getMaxEmitters()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "REALTIME_CAPACITY_REACHED",
                    "Trop de connexions temps réel ouvertes : réessayez dans un instant.");
        }
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(properties.getEmitterTimeoutMinutes()).toMillis());
        String id = channel.name() + "-" + clientIds.incrementAndGet();
        Client client = new Client(id, channel, userId, emitter);
        clients.put(id, client);
        emitter.onCompletion(() -> clients.remove(id));
        emitter.onTimeout(() -> {
            clients.remove(id);
            emitter.complete();
        });
        emitter.onError(e -> clients.remove(id));
        try {
            // `retry: 5000` first, so a browser that loses the stream reconnects quickly.
            emitter.send(SseEmitter.event().reconnectTime(5_000).comment("connecte"));
        } catch (IOException | IllegalStateException e) {
            clients.remove(id);
            emitter.completeWithError(e);
            return emitter;
        }
        startKeepalive();
        return emitter;
    }

    /** Sends an event to every stream of a channel. */
    public void broadcast(Channel channel, String event, Object payload) {
        long id = eventIds.incrementAndGet();
        clients.values().stream().filter(c -> c.channel() == channel).forEach(c -> send(c, id, event, payload));
    }

    /** Sends an event to the streams of one user only (notifications are private). */
    public void sendToUser(Channel channel, Long userId, String event, Object payload) {
        if (userId == null) {
            return;
        }
        long id = eventIds.incrementAndGet();
        clients.values().stream()
                .filter(c -> c.channel() == channel && userId.equals(c.userId()))
                .forEach(c -> send(c, id, event, payload));
    }

    /** Sends the first event of a stream, from the request thread. */
    public void sendTo(SseEmitter emitter, String event, Object payload) {
        try {
            emitter.send(SseEmitter.event().id(Long.toString(eventIds.incrementAndGet())).name(event)
                    .data(payload, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            emitter.completeWithError(e);
        }
    }

    public int count(Channel channel) {
        return (int) clients.values().stream().filter(c -> c.channel() == channel).count();
    }

    private void send(Client client, long id, String event, Object payload) {
        try {
            client.emitter().send(SseEmitter.event().id(Long.toString(id)).name(event)
                    .data(payload, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            clients.remove(client.id());
            client.emitter().completeWithError(e);
        }
    }

    private void ping() {
        clients.values().forEach(client -> {
            try {
                client.emitter().send(SseEmitter.event().comment("ping"));
            } catch (IOException | IllegalStateException e) {
                clients.remove(client.id());
                client.emitter().completeWithError(e);
            }
        });
    }

    private synchronized void startKeepalive() {
        if (keepalive != null) {
            return;
        }
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "tpub-sse-keepalive");
            thread.setDaemon(true);
            return thread;
        });
        int seconds = Math.max(5, properties.getKeepaliveSeconds());
        executor.scheduleAtFixedRate(() -> {
            try {
                ping();
            } catch (RuntimeException e) {
                log.warn("Ping SSE impossible : {}", e.getMessage());
            }
        }, seconds, seconds, TimeUnit.SECONDS);
        keepalive = executor;
    }

    @PreDestroy
    void shutdown() {
        if (keepalive != null) {
            keepalive.shutdownNow();
        }
        clients.values().forEach(client -> {
            try {
                client.emitter().complete();
            } catch (RuntimeException e) {
                log.debug("Fermeture d'un flux SSE : {}", e.getMessage());
            }
        });
        clients.clear();
    }
}
