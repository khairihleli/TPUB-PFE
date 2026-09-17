package com.example.tpubpfe.service.realtime;

/**
 * Something to push on the supervision stream (docs/round2-contract.md §5.3). Published inside the business
 * transaction; {@link RealtimeRelay} broadcasts it after commit.
 */
public record SupervisionBroadcastEvent(String event, Object payload) {
}
