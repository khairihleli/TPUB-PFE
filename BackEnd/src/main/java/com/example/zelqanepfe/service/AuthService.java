package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AuthResponse;
import com.example.zelqanepfe.dto.LoginChallengeResponse;
import com.example.zelqanepfe.dto.LoginRequest;
import com.example.zelqanepfe.dto.LoginResponse;
import com.example.zelqanepfe.dto.RegisterRequest;
import com.example.zelqanepfe.dto.TotpSetupResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.LoginChallenge;
import com.example.zelqanepfe.model.LoginFailureReason;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.ClientRepository;
import com.example.zelqanepfe.repository.RoleRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.RequestInfo;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {

    /** Hash compared against when the e-mail is unknown, to even out response timings (computed lazily). */
    private volatile String dummyHash;

    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessionService;
    private final LoginHistoryService loginHistoryService;
    private final Clock clock;
    private final TwoFactorService twoFactorService;
    private final LoginChallengeService challengeService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw AccountErrors.emailAlreadyRegistered();
        }

        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(roleRepository.findByCode(RoleCode.ANNONCEUR)
                        .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                                "Rôle annonceur absent : base de données non initialisée.")))
                .nom(request.getNom().trim())
                .societe(blankToNull(request.getSociete()))
                .telephone(blankToNull(request.getTelephone()))
                .adresse(blankToNull(request.getAdresse()))
                .isActive(true)
                .lastLoginAt(clock.instant())
                .build();

        user = userRepository.save(user);

        Client client = Client.builder()
                .user(user)
                .companyName(user.getSociete())
                .build();
        clientRepository.save(client);

        HttpServletRequest http = RequestInfo.currentRequest();
        SessionService.IssuedSession issued = sessionService.open(user, http);
        loginHistoryService.recordSuccess(user.getId(), user.getEmail(), issued.session().getId(), http);
        return toResponse(user, issued);
    }

    /**
     * Checks the password first, then the account status, so a disabled account is only revealed to someone who
     * knows its password. Every failed attempt is written to {@code login_history}. When TOTP is enabled (or
     * mandatory for the role) a challenge is returned instead of a session: no session and no success row exist
     * before the second step (docs/round2-contract.md §3.3).
     */
    @Transactional
    public LoginResponse login(LoginRequest request) {
        HttpServletRequest http = RequestInfo.currentRequest();
        String email = normalizeEmail(request.getEmail());
        Optional<User> found = findByEmail(email);
        if (found.isEmpty()) {
            passwordEncoder.matches(request.getPassword(), dummyHash());
            loginHistoryService.recordFailure(null, email, LoginFailureReason.UNKNOWN_USER, http);
            throw AccountErrors.badCredentials();
        }
        User user = found.get();
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            loginHistoryService.recordFailure(user.getId(), email, LoginFailureReason.BAD_CREDENTIALS, http);
            throw AccountErrors.badCredentials();
        }
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            loginHistoryService.recordFailure(user.getId(), email, LoginFailureReason.ACCOUNT_DISABLED, http);
            throw AccountErrors.accountDisabled();
        }

        if (Boolean.TRUE.equals(user.getTotpEnabled())) {
            return challenge(user, LoginChallenge.Purpose.TOTP_LOGIN, LoginChallengeResponse.TOTP_REQUIRED, http);
        }
        if (twoFactorService.isRequired(user)) {
            return challenge(user, LoginChallenge.Purpose.TOTP_ENROLMENT,
                    LoginChallengeResponse.TOTP_ENROLMENT_REQUIRED, http);
        }
        return complete(user, http);
    }

    /** Second step: a TOTP code or a recovery code. Wrong code → 401 {@code TOTP_CODE_INVALID}, attempt counted. */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResponse verify(String challengeToken, String code) {
        HttpServletRequest http = RequestInfo.currentRequest();
        LoginChallenge challenge = challengeService.require(challengeToken, LoginChallenge.Purpose.TOTP_LOGIN);
        User user = activeUser(challenge);
        TwoFactorService.CodeCheck check = twoFactorService.verifyCode(user, code);
        if (check == TwoFactorService.CodeCheck.INVALID) {
            challengeService.recordFailedAttempt(challenge.getId());
            loginHistoryService.recordFailure(user.getId(), user.getEmail(), LoginFailureReason.TOTP_INVALID, http);
            throw AccountErrors.totpCodeInvalid(HttpStatus.UNAUTHORIZED);
        }
        challengeService.consume(challenge);
        AuthResponse response = complete(user, http);
        if (check == TwoFactorService.CodeCheck.RECOVERY) {
            response.setRecoveryCodeUsed(true);
        }
        return response;
    }

    /** Mandatory enrolment, step 1: a pending secret for the challenge's user. */
    @Transactional
    public TotpSetupResponse enrolmentSetup(String challengeToken) {
        LoginChallenge challenge = challengeService.require(challengeToken, LoginChallenge.Purpose.TOTP_ENROLMENT);
        return twoFactorService.beginSetup(activeUser(challenge));
    }

    /** Mandatory enrolment, step 2: confirms the code, enables TOTP and opens the session. */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResponse enrolmentEnable(String challengeToken, String code) {
        HttpServletRequest http = RequestInfo.currentRequest();
        LoginChallenge challenge = challengeService.require(challengeToken, LoginChallenge.Purpose.TOTP_ENROLMENT);
        User user = activeUser(challenge);
        List<String> codes;
        try {
            codes = twoFactorService.enable(user, code, HttpStatus.UNAUTHORIZED);
        } catch (ApiException ex) {
            if ("TOTP_CODE_INVALID".equals(ex.getCode())) {
                challengeService.recordFailedAttempt(challenge.getId());
                loginHistoryService.recordFailure(user.getId(), user.getEmail(), LoginFailureReason.TOTP_INVALID, http);
            }
            throw ex;
        }
        challengeService.consume(challenge);
        AuthResponse response = complete(user, http);
        response.setRecoveryCodes(codes);
        return response;
    }

    private LoginChallengeResponse challenge(User user, LoginChallenge.Purpose purpose, String status,
                                             HttpServletRequest http) {
        LoginChallengeService.Issued issued = challengeService.issue(user, purpose, http);
        return LoginChallengeResponse.builder()
                .status(status)
                .challengeToken(issued.token())
                .expiresAt(issued.challenge().getExpiresAt())
                .email(user.getEmail())
                .build();
    }

    private AuthResponse complete(User user, HttpServletRequest http) {
        user.setLastLoginAt(clock.instant());
        userRepository.save(user);
        SessionService.IssuedSession issued = sessionService.open(user, http);
        loginHistoryService.recordSuccess(user.getId(), user.getEmail(), issued.session().getId(), http);
        return toResponse(user, issued);
    }

    /** The challenge's user, still active (a deactivated account cannot finish its login). */
    private User activeUser(LoginChallenge challenge) {
        User user = userRepository.findById(challenge.getUserId()).orElseThrow(AccountErrors::challengeExpired);
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw AccountErrors.accountDisabled();
        }
        return user;
    }

    private String dummyHash() {
        if (dummyHash == null) {
            dummyHash = passwordEncoder.encode(java.util.UUID.randomUUID().toString());
        }
        return dummyHash;
    }

    private Optional<User> findByEmail(String email) {
        Optional<User> exact = userRepository.findByEmail(email);
        if (exact.isPresent()) {
            return exact;
        }
        List<User> candidates = userRepository.findAllByEmailIgnoreCase(email);
        return candidates.size() == 1 ? Optional.of(candidates.get(0)) : Optional.empty();
    }

    private static AuthResponse toResponse(User user, SessionService.IssuedSession issued) {
        return AuthResponse.builder()
                .token(issued.token())
                .email(user.getEmail())
                .nom(user.getNom())
                .role(user.getRole().getCode().name())
                .userId(user.getId())
                .sessionId(issued.session().getId())
                .expiresAt(issued.session().getExpiresAt())
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                .twoFactorEnabled(Boolean.TRUE.equals(user.getTotpEnabled()))
                .build();
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
