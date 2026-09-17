package com.example.tpubpfe.security;

import com.example.tpubpfe.config.TpubProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;

/**
 * Issues and verifies the HS256 access tokens. Claims: {@code sub} (e-mail), {@code role}, {@code sid}
 * (server-side {@code user_sessions.id}), {@code iat}, {@code exp}.
 */
@Service
public class JwtService {

    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_SESSION = "sid";

    /** Verified claims of an access token. */
    public record TokenClaims(String subject, String role, String sessionId, Instant issuedAt, Instant expiresAt) {
    }

    private final TpubProperties tpubProperties;
    private final Clock clock;

    public JwtService(TpubProperties tpubProperties, Clock clock) {
        this.tpubProperties = tpubProperties;
        this.clock = clock;
    }

    /** Token lifetime configured by {@code tpub.jwt.expiration-ms}. */
    public long expirationMs() {
        return tpubProperties.getJwt().getExpirationMs();
    }

    public String generateToken(String subject, String roleCode, String sessionId, Instant issuedAt, Instant expiresAt) {
        return Jwts.builder()
                .subject(subject)
                .claim(CLAIM_ROLE, "ROLE_" + roleCode)
                .claim(CLAIM_SESSION, sessionId)
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * Verifies signature and expiry.
     *
     * @throws TokenRejectedException {@code TOKEN_EXPIRED} or {@code TOKEN_INVALID}
     */
    public TokenClaims parse(String token) {
        if (token == null || token.isBlank()) {
            throw TokenRejectedException.invalid();
        }
        Claims claims;
        try {
            claims = Jwts.parser()
                    .verifyWith(getSigningKey())
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token.trim())
                    .getPayload();
        } catch (ExpiredJwtException ex) {
            throw TokenRejectedException.expired();
        } catch (JwtException | IllegalArgumentException ex) {
            throw TokenRejectedException.invalid();
        }
        if (claims.getSubject() == null || claims.getSubject().isBlank()) {
            throw TokenRejectedException.invalid();
        }
        Object sid = claims.get(CLAIM_SESSION);
        Object role = claims.get(CLAIM_ROLE);
        return new TokenClaims(
                claims.getSubject(),
                role == null ? null : role.toString(),
                sid == null ? null : sid.toString(),
                claims.getIssuedAt() == null ? null : claims.getIssuedAt().toInstant(),
                claims.getExpiration() == null ? null : claims.getExpiration().toInstant());
    }

    public String extractUsername(String token) {
        return parse(token).subject();
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = tpubProperties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
