package com.example.tpubpfe.service.realtime;

import com.example.tpubpfe.config.SupervisionProperties;
import com.example.tpubpfe.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** SSE registry: capacity, per-channel and per-user routing (docs/round2-contract.md §5.3). */
class SseHubTest {

    private static SseHub hub(int maxEmitters) {
        SupervisionProperties.Supervision properties = new SupervisionProperties.Supervision();
        properties.setMaxEmitters(maxEmitters);
        return new SseHub(properties);
    }

    @Test
    void streamsAreCountedPerChannel() {
        SseHub hub = hub(10);
        hub.open(SseHub.Channel.SUPERVISION, 1L);
        hub.open(SseHub.Channel.SUPERVISION, 2L);
        hub.open(SseHub.Channel.NOTIFICATIONS, 2L);

        assertThat(hub.count(SseHub.Channel.SUPERVISION)).isEqualTo(2);
        assertThat(hub.count(SseHub.Channel.NOTIFICATIONS)).isEqualTo(1);
    }

    @Test
    void tooManyStreamsAreRefused() {
        SseHub hub = hub(1);
        hub.open(SseHub.Channel.SUPERVISION, 1L);

        assertThatThrownBy(() -> hub.open(SseHub.Channel.NOTIFICATIONS, 1L))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(((ApiException) e).getCode()).isEqualTo("REALTIME_CAPACITY_REACHED");
                });
    }

    @Test
    void broadcastingKeepsTheStreamsOpen() {
        SseHub hub = hub(10);
        hub.open(SseHub.Channel.SUPERVISION, 1L);
        hub.open(SseHub.Channel.NOTIFICATIONS, 5L);

        hub.broadcast(SseHub.Channel.SUPERVISION, "stats", Map.of("openAlerts", 2));
        hub.sendToUser(SseHub.Channel.NOTIFICATIONS, 5L, "unread-count", Map.of("count", 3));
        hub.sendToUser(SseHub.Channel.NOTIFICATIONS, null, "unread-count", Map.of("count", 3));

        assertThat(hub.count(SseHub.Channel.SUPERVISION)).isEqualTo(1);
        assertThat(hub.count(SseHub.Channel.NOTIFICATIONS)).isEqualTo(1);
    }
}
