package com.example.zelqanepfe.security.device;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.LongSupplier;

/**
 * In-memory limits of the player routes (docs/round2-contract.md §3.4):
 * <ul>
 *   <li>a token bucket per support (capacity {@code burst}, refill {@code perMinute / 60} tokens per second);</li>
 *   <li>a counter of invalid-key failures per IP within the current clock minute.</li>
 * </ul>
 * Entries idle for more than 10 minutes are evicted. "Now" comes from a millisecond supplier (testable).
 */
public class DeviceRateLimiter {

    static final long IDLE_EVICTION_MS = 10 * 60 * 1000L;
    private static final long EVICTION_PERIOD_MS = 60 * 1000L;

    private final int burst;
    private final double refillPerMs;
    private final int maxFailuresPerMinute;
    private final LongSupplier nowMs;
    private final ConcurrentMap<Long, Bucket> buckets = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, FailureWindow> failures = new ConcurrentHashMap<>();
    private volatile long lastEvictionMs;

    public DeviceRateLimiter(int perMinute, int burst, int maxFailuresPerMinute, LongSupplier nowMs) {
        this.burst = Math.max(1, burst);
        this.refillPerMs = Math.max(1, perMinute) / 60_000.0;
        this.maxFailuresPerMinute = Math.max(1, maxFailuresPerMinute);
        this.nowMs = nowMs;
        this.lastEvictionMs = nowMs.getAsLong();
    }

    /** Outcome of a token request: {@code retryAfterSeconds} is 0 when allowed. */
    public record Decision(boolean allowed, long retryAfterSeconds) {
    }

    /** True when the IP already used up its invalid-key failures of the current minute (the next request is refused). */
    public boolean isIpBlocked(String ip) {
        long now = nowMs.getAsLong();
        evictIfDue(now);
        FailureWindow window = failures.get(key(ip));
        return window != null && window.minute == now / 60_000 && window.count >= maxFailuresPerMinute;
    }

    public void recordFailure(String ip) {
        long now = nowMs.getAsLong();
        long minute = now / 60_000;
        failures.compute(key(ip), (k, window) -> {
            if (window == null || window.minute != minute) {
                return new FailureWindow(minute, 1, now);
            }
            return new FailureWindow(minute, window.count + 1, now);
        });
    }

    public Decision tryAcquire(Long supportId) {
        long now = nowMs.getAsLong();
        evictIfDue(now);
        Bucket bucket = buckets.computeIfAbsent(supportId, id -> new Bucket(burst, now));
        synchronized (bucket) {
            double elapsed = Math.max(0, now - bucket.lastRefillMs);
            bucket.tokens = Math.min(burst, bucket.tokens + elapsed * refillPerMs);
            bucket.lastRefillMs = now;
            bucket.lastUsedMs = now;
            if (bucket.tokens >= 1) {
                bucket.tokens -= 1;
                return new Decision(true, 0);
            }
            double missing = 1 - bucket.tokens;
            long retry = (long) Math.ceil(missing / refillPerMs / 1000.0);
            return new Decision(false, Math.max(1, retry));
        }
    }

    int trackedSupports() {
        return buckets.size();
    }

    int trackedIps() {
        return failures.size();
    }

    private void evictIfDue(long now) {
        if (now - lastEvictionMs < EVICTION_PERIOD_MS) {
            return;
        }
        lastEvictionMs = now;
        buckets.entrySet().removeIf(e -> now - e.getValue().lastUsedMs > IDLE_EVICTION_MS);
        failures.entrySet().removeIf(e -> now - e.getValue().lastSeenMs > IDLE_EVICTION_MS);
    }

    private static String key(String ip) {
        return ip == null ? "?" : ip;
    }

    private static final class Bucket {
        private double tokens;
        private long lastRefillMs;
        private long lastUsedMs;

        private Bucket(int tokens, long now) {
            this.tokens = tokens;
            this.lastRefillMs = now;
            this.lastUsedMs = now;
        }
    }

    private record FailureWindow(long minute, int count, long lastSeenMs) {
    }
}
