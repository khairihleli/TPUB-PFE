package com.example.zelqanepfe.security.device;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class DeviceRateLimiterTest {

    @Test
    void tokenBucketAllowsBurstThenRefillsAtThePerMinuteRate() {
        AtomicLong now = new AtomicLong(1_000_000L);
        DeviceRateLimiter limiter = new DeviceRateLimiter(60, 3, 5, now::get);

        assertThat(limiter.tryAcquire(1L).allowed()).isTrue();
        assertThat(limiter.tryAcquire(1L).allowed()).isTrue();
        assertThat(limiter.tryAcquire(1L).allowed()).isTrue();
        DeviceRateLimiter.Decision refused = limiter.tryAcquire(1L);
        assertThat(refused.allowed()).isFalse();
        assertThat(refused.retryAfterSeconds()).isEqualTo(1);
        assertThat(limiter.tryAcquire(2L).allowed()).as("buckets are per support").isTrue();

        now.addAndGet(1_000);
        assertThat(limiter.tryAcquire(1L).allowed()).isTrue();
        assertThat(limiter.tryAcquire(1L).allowed()).isFalse();

        now.addAndGet(60_000);
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire(1L).allowed()).isTrue();
        }
        assertThat(limiter.tryAcquire(1L).allowed()).as("capacity stays capped at burst").isFalse();
    }

    @Test
    void invalidKeyFailuresBlockTheIpForTheCurrentMinute() {
        AtomicLong now = new AtomicLong(120_000L);
        DeviceRateLimiter limiter = new DeviceRateLimiter(120, 30, 3, now::get);

        for (int i = 0; i < 3; i++) {
            assertThat(limiter.isIpBlocked("10.0.0.1")).isFalse();
            limiter.recordFailure("10.0.0.1");
        }
        assertThat(limiter.isIpBlocked("10.0.0.1")).isTrue();
        assertThat(limiter.isIpBlocked("10.0.0.2")).isFalse();

        now.addAndGet(60_000);
        assertThat(limiter.isIpBlocked("10.0.0.1")).as("new minute").isFalse();
    }

    @Test
    void idleEntriesAreEvicted() {
        AtomicLong now = new AtomicLong(0L);
        DeviceRateLimiter limiter = new DeviceRateLimiter(120, 30, 3, now::get);
        limiter.tryAcquire(1L);
        limiter.recordFailure("10.0.0.9");
        assertThat(limiter.trackedSupports()).isEqualTo(1);

        now.addAndGet(DeviceRateLimiter.IDLE_EVICTION_MS + 61_000);
        limiter.tryAcquire(2L);
        assertThat(limiter.trackedSupports()).isEqualTo(1);
        assertThat(limiter.trackedIps()).isZero();
    }
}
