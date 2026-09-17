package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.LoginChallenge;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.LoginChallengeRepository;
import com.example.tpubpfe.security.RequestInfo;
import com.example.tpubpfe.security.SecretKeys;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Second login step tokens ({@code login_challenges}, docs/round2-contract.md §3.3). */
@Service
@RequiredArgsConstructor
public class LoginChallengeService {

    public static final String TOKEN_PREFIX = "tpc_";

    private final LoginChallengeRepository repository;
    private final TpubProperties properties;
    private final Clock clock;

    /** A new challenge and its clear token (returned once, never stored). */
    public record Issued(LoginChallenge challenge, String token) {
    }

    @Transactional
    public Issued issue(User user, LoginChallenge.Purpose purpose, HttpServletRequest request) {
        Instant now = clock.instant();
        String token = TOKEN_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(SecretKeys.randomBytes(32));
        long ttl = Math.max(30, properties.getSecurity().getTotp().getChallengeTtlSeconds());
        LoginChallenge challenge = repository.save(LoginChallenge.builder()
                .id(UUID.randomUUID().toString())
                .tokenHash(SecretKeys.sha256Hex(token))
                .userId(user.getId())
                .purpose(purpose)
                .attempts((short) 0)
                .createdAt(now)
                .expiresAt(now.plus(Duration.ofSeconds(ttl)))
                .ipAddress(RequestInfo.clientIp(request))
                .userAgent(RequestInfo.userAgent(request))
                .build());
        return new Issued(challenge, token);
    }

    /**
     * The usable challenge of {@code token} for {@code purpose}: 401 {@code CHALLENGE_EXPIRED} when unknown, of
     * another purpose, consumed, expired or out of attempts. Deliberately not transactional: a rejection must not
     * mark the caller's transaction rollback-only.
     */
    public LoginChallenge require(String token, LoginChallenge.Purpose purpose) {
        if (token == null || !token.startsWith(TOKEN_PREFIX) || token.length() > 100) {
            throw AccountErrors.challengeExpired();
        }
        LoginChallenge challenge = repository.findByTokenHash(SecretKeys.sha256Hex(token))
                .orElseThrow(AccountErrors::challengeExpired);
        if (!isUsable(challenge, purpose, clock.instant(), properties.getSecurity().getTotp().getMaxAttempts())) {
            throw AccountErrors.challengeExpired();
        }
        return challenge;
    }

    static boolean isUsable(LoginChallenge challenge, LoginChallenge.Purpose purpose, Instant now, int maxAttempts) {
        return challenge.getPurpose() == purpose
                && challenge.getConsumedAt() == null
                && challenge.getExpiresAt() != null && challenge.getExpiresAt().isAfter(now)
                && (challenge.getAttempts() == null ? 0 : challenge.getAttempts()) < maxAttempts;
    }

    /** Counts a wrong code in its own transaction, so it survives the 401 thrown right after. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailedAttempt(String challengeId) {
        repository.findById(challengeId).ifPresent(challenge -> {
            challenge.setAttempts((short) ((challenge.getAttempts() == null ? 0 : challenge.getAttempts()) + 1));
            repository.save(challenge);
        });
    }

    @Transactional
    public void consume(LoginChallenge challenge) {
        challenge.setConsumedAt(clock.instant());
        repository.save(challenge);
    }

    /** Deletes challenges expired for more than 24 hours. */
    @Transactional
    public int purgeExpired() {
        return repository.deleteExpiredBefore(clock.instant().minus(Duration.ofHours(24)));
    }
}
