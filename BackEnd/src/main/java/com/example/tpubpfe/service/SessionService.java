package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.SessionResponse;
import com.example.tpubpfe.model.SessionRevokeReason;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.UserSession;
import com.example.tpubpfe.repository.UserSessionRepository;
import com.example.tpubpfe.security.JwtService;
import com.example.tpubpfe.security.RequestInfo;
import com.example.tpubpfe.security.TokenRejectedException;
import com.example.tpubpfe.security.UserDetailsImpl;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Server-side sessions bound to the JWT {@code sid} claim: creation at login, per-request validation, revocation.
 */
@Service
@RequiredArgsConstructor
public class SessionService {

    private final UserSessionRepository sessionRepository;
    private final JwtService jwtService;
    private final TpubProperties properties;
    private final Clock clock;

    /** A new session and its signed token. */
    public record IssuedSession(UserSession session, String token) {
    }

    /** Creates the session row and signs the matching token (expiry = now + {@code tpub.jwt.expiration-ms}). */
    @Transactional
    public IssuedSession open(User user, HttpServletRequest request) {
        Instant now = clock.instant();
        UserSession session = UserSession.builder()
                .id(UUID.randomUUID().toString())
                .user(user)
                .createdAt(now)
                .lastSeenAt(now)
                .expiresAt(now.plusMillis(jwtService.expirationMs()))
                .ipAddress(RequestInfo.clientIp(request))
                .userAgent(RequestInfo.userAgent(request))
                .build();
        session = sessionRepository.save(session);
        String token = jwtService.generateToken(user.getEmail(), user.getRole().getCode().name(), session.getId(),
                now, session.getExpiresAt());
        return new IssuedSession(session, token);
    }

    /**
     * Validates a bearer token in contract order: signature/expiry, session (exists, not revoked, not expired,
     * same user), then account active. Touches {@code lastSeenAt} at most every
     * {@code tpub.security.session-touch-seconds}.
     *
     * @throws TokenRejectedException with the matching 401 code
     */
    @Transactional
    public UserDetailsImpl authenticate(String token) {
        JwtService.TokenClaims claims = jwtService.parse(token);
        if (claims.sessionId() == null || claims.sessionId().isBlank()) {
            throw TokenRejectedException.revoked();
        }
        UserSession session = sessionRepository.findWithUserById(claims.sessionId())
                .orElseThrow(TokenRejectedException::revoked);
        User user = session.getUser();
        if (user == null || !claims.subject().equalsIgnoreCase(user.getEmail())) {
            throw TokenRejectedException.invalid();
        }
        Instant now = clock.instant();
        if (!session.isActiveAt(now)) {
            throw TokenRejectedException.revoked();
        }
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw TokenRejectedException.disabled();
        }
        long touchSeconds = Math.max(0, properties.getSecurity().getSessionTouchSeconds());
        if (session.getLastSeenAt() == null
                || Duration.between(session.getLastSeenAt(), now).getSeconds() >= touchSeconds) {
            session.setLastSeenAt(now);
            sessionRepository.save(session);
        }
        return UserDetailsImpl.fromUser(user, session.getId());
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> listActive(Long userId, String currentSessionId) {
        return sessionRepository.findActiveByUserId(userId, clock.instant()).stream()
                .map(s -> toResponse(s, currentSessionId))
                .toList();
    }

    @Transactional(readOnly = true)
    public long countActive(Long userId) {
        return sessionRepository.countActiveByUserId(userId, clock.instant());
    }

    /** Revokes one session of {@code userId}; 404 {@code SESSION_NOT_FOUND} when it belongs to someone else. */
    @Transactional
    public void revokeOwn(Long userId, String sessionId, SessionRevokeReason reason) {
        UserSession session = sessionId == null ? null : sessionRepository.findById(sessionId).orElse(null);
        if (session == null || session.getUser() == null || !Objects.equals(session.getUser().getId(), userId)) {
            throw AccountErrors.sessionNotFound();
        }
        revoke(session, reason, clock.instant());
    }

    /** Revokes the given session if it is still active (no-op otherwise). */
    @Transactional
    public void revokeIfActive(String sessionId, SessionRevokeReason reason) {
        if (sessionId == null) {
            return;
        }
        sessionRepository.findById(sessionId).ifPresent(s -> revoke(s, reason, clock.instant()));
    }

    /** Revokes every active session of a user except {@code keepSessionId} (may be null). Returns the count. */
    @Transactional
    public int revokeAll(Long userId, String keepSessionId, SessionRevokeReason reason) {
        Instant now = clock.instant();
        int revoked = 0;
        for (UserSession session : sessionRepository.findActiveByUserId(userId, now)) {
            if (session.getId().equals(keepSessionId)) {
                continue;
            }
            if (revoke(session, reason, now)) {
                revoked++;
            }
        }
        return revoked;
    }

    private boolean revoke(UserSession session, SessionRevokeReason reason, Instant now) {
        if (!session.isActiveAt(now)) {
            return false;
        }
        session.setRevokedAt(now);
        session.setRevokedReason(reason);
        sessionRepository.save(session);
        return true;
    }

    static SessionResponse toResponse(UserSession session, String currentSessionId) {
        return SessionResponse.builder()
                .id(session.getId())
                .createdAt(session.getCreatedAt())
                .lastSeenAt(session.getLastSeenAt())
                .expiresAt(session.getExpiresAt())
                .ipAddress(session.getIpAddress())
                .userAgent(session.getUserAgent())
                .current(session.getId().equals(currentSessionId))
                .build();
    }
}
