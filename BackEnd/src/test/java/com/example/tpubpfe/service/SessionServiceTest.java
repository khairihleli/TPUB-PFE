package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SessionRevokeReason;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.UserSession;
import com.example.tpubpfe.repository.UserSessionRepository;
import com.example.tpubpfe.security.JwtService;
import com.example.tpubpfe.security.TokenRejectedException;
import com.example.tpubpfe.security.UserDetailsImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-17T08:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneId.of("Africa/Tunis"));

    private UserSessionRepository repository;
    private JwtService jwtService;
    private SessionService service;
    private User user;

    @BeforeEach
    void setUp() {
        TpubProperties properties = new TpubProperties();
        properties.getJwt().setSecret("test_secret_for_session_service_at_least_32_chars");
        properties.getJwt().setExpirationMs(3_600_000L);
        repository = mock(UserSessionRepository.class);
        when(repository.save(any(UserSession.class))).thenAnswer(inv -> inv.getArgument(0));
        jwtService = new JwtService(properties, CLOCK);
        service = new SessionService(repository, jwtService, properties, CLOCK);
        user = User.builder().id(7L).email("ann@tpub.test").nom("Ann").passwordHash("x").isActive(true)
                .role(Role.builder().code(RoleCode.ANNONCEUR).name("Annonceur").build()).build();
    }

    private UserSession session(String id) {
        return UserSession.builder().id(id).user(user).createdAt(NOW.minusSeconds(600))
                .lastSeenAt(NOW.minusSeconds(10)).expiresAt(NOW.plusSeconds(3000)).build();
    }

    private String tokenFor(String sessionId) {
        return jwtService.generateToken(user.getEmail(), "ANNONCEUR", sessionId, NOW.minusSeconds(600), NOW.plusSeconds(3000));
    }

    @Test
    void openCreatesSessionAndSignedTokenCarryingSid() {
        SessionService.IssuedSession issued = service.open(user, null);

        assertThat(issued.session().getExpiresAt()).isEqualTo(NOW.plusMillis(3_600_000L));
        JwtService.TokenClaims claims = jwtService.parse(issued.token());
        assertThat(claims.sessionId()).isEqualTo(issued.session().getId());
        assertThat(claims.subject()).isEqualTo("ann@tpub.test");
        assertThat(claims.role()).isEqualTo("ROLE_ANNONCEUR");
    }

    @Test
    void validTokenAuthenticatesWithSessionIdAndThrottlesTouch() {
        when(repository.findWithUserById("s1")).thenReturn(Optional.of(session("s1")));

        UserDetailsImpl principal = service.authenticate(tokenFor("s1"));

        assertThat(principal.getId()).isEqualTo(7L);
        assertThat(principal.getSessionId()).isEqualTo("s1");
        verify(repository, never()).save(any());
    }

    @Test
    void staleLastSeenIsTouched() {
        UserSession stale = session("s1");
        stale.setLastSeenAt(NOW.minusSeconds(120));
        when(repository.findWithUserById("s1")).thenReturn(Optional.of(stale));

        service.authenticate(tokenFor("s1"));

        assertThat(stale.getLastSeenAt()).isEqualTo(NOW);
        verify(repository).save(stale);
    }

    @Test
    void rejectsTamperedAndExpiredTokens() {
        String token = tokenFor("s1");
        String tampered = token.substring(0, token.length() - 3) + (token.endsWith("AAA") ? "BBB" : "AAA");
        assertCode(() -> service.authenticate(tampered), "TOKEN_INVALID");
        assertCode(() -> service.authenticate("not-a-jwt"), "TOKEN_INVALID");

        String expired = jwtService.generateToken(user.getEmail(), "ANNONCEUR", "s1",
                NOW.minusSeconds(7200), NOW.minusSeconds(60));
        assertCode(() -> service.authenticate(expired), "TOKEN_EXPIRED");
    }

    @Test
    void missingRevokedOrExpiredSessionIsRevoked() {
        String withoutSid = jwtService.generateToken(user.getEmail(), "ANNONCEUR", null, NOW, NOW.plusSeconds(60));
        assertCode(() -> service.authenticate(withoutSid), "SESSION_REVOKED");

        when(repository.findWithUserById(anyString())).thenReturn(Optional.empty());
        assertCode(() -> service.authenticate(tokenFor("gone")), "SESSION_REVOKED");

        UserSession revoked = session("s2");
        revoked.setRevokedAt(NOW.minusSeconds(5));
        when(repository.findWithUserById("s2")).thenReturn(Optional.of(revoked));
        assertCode(() -> service.authenticate(tokenFor("s2")), "SESSION_REVOKED");

        UserSession expired = session("s3");
        expired.setExpiresAt(NOW.minusSeconds(1));
        when(repository.findWithUserById("s3")).thenReturn(Optional.of(expired));
        assertCode(() -> service.authenticate(tokenFor("s3")), "SESSION_REVOKED");
    }

    @Test
    void disabledAccountIsCheckedAfterTheSession() {
        user.setIsActive(false);
        when(repository.findWithUserById("s1")).thenReturn(Optional.of(session("s1")));
        assertCode(() -> service.authenticate(tokenFor("s1")), "ACCOUNT_DISABLED");
    }

    @Test
    void tokenOfAnotherUserForTheSessionIsInvalid() {
        when(repository.findWithUserById("s1")).thenReturn(Optional.of(session("s1")));
        String foreign = jwtService.generateToken("other@tpub.test", "ANNONCEUR", "s1", NOW, NOW.plusSeconds(60));
        assertCode(() -> service.authenticate(foreign), "TOKEN_INVALID");
    }

    @Test
    void revokeAllKeepsTheGivenSessionAndCountsOnlyActiveOnes() {
        UserSession current = session("current");
        UserSession other = session("other");
        when(repository.findActiveByUserId(eq(7L), any())).thenReturn(List.of(current, other));

        int revoked = service.revokeAll(7L, "current", SessionRevokeReason.PASSWORD_CHANGED);

        assertThat(revoked).isEqualTo(1);
        assertThat(current.getRevokedAt()).isNull();
        assertThat(other.getRevokedAt()).isEqualTo(NOW);
        assertThat(other.getRevokedReason()).isEqualTo(SessionRevokeReason.PASSWORD_CHANGED);
    }

    @Test
    void revokeOwnRejectsSessionsOfOtherUsers() {
        UserSession foreign = session("foreign");
        foreign.setUser(User.builder().id(99L).build());
        when(repository.findById("foreign")).thenReturn(Optional.of(foreign));
        when(repository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revokeOwn(7L, "foreign", SessionRevokeReason.REVOKED_BY_USER))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("SESSION_NOT_FOUND"));
        assertThatThrownBy(() -> service.revokeOwn(7L, "missing", SessionRevokeReason.REVOKED_BY_USER))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("SESSION_NOT_FOUND"));
        assertThat(foreign.getRevokedAt()).isNull();
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(TokenRejectedException.class,
                ex -> assertThat(ex.getCode()).isEqualTo(code));
    }
}
