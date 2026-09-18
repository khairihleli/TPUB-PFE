package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.dto.TotpSetupResponse;
import com.example.zelqanepfe.dto.TwoFactorStatusResponse;
import com.example.zelqanepfe.model.RecoveryCode;
import com.example.zelqanepfe.model.SessionRevokeReason;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.RecoveryCodeRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.SecretKeys;
import com.example.zelqanepfe.security.totp.Base32;
import com.example.zelqanepfe.security.totp.RecoveryCodes;
import com.example.zelqanepfe.security.totp.TotpCipher;
import com.example.zelqanepfe.security.totp.TotpGenerator;
import com.example.zelqanepfe.security.totp.TotpPolicy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

/**
 * TOTP two-factor authentication (docs/round2-contract.md §3.3): enrolment, verification with replay protection,
 * recovery codes, self-service and administrator reset.
 */
@Slf4j
@Service
public class TwoFactorService {

    /** Validity of a pending (not yet confirmed) secret. */
    public static final Duration PENDING_TTL = Duration.ofMinutes(10);

    /** Outcome of a second-step code. */
    public enum CodeCheck {
        TOTP,
        RECOVERY,
        INVALID
    }

    private final UserRepository userRepository;
    private final RecoveryCodeRepository recoveryCodeRepository;
    private final SessionService sessionService;
    private final AuditService auditService;
    private final PasswordEncoder passwordEncoder;
    private final TotpPolicy policy;
    private final ZelqaneProperties properties;
    private final Clock clock;
    private final byte[] totpKey;
    private final TotpCipher cipher;

    public TwoFactorService(UserRepository userRepository, RecoveryCodeRepository recoveryCodeRepository,
                            SessionService sessionService, AuditService auditService, PasswordEncoder passwordEncoder,
                            TotpPolicy policy, ZelqaneProperties properties, Clock clock) {
        this.userRepository = userRepository;
        this.recoveryCodeRepository = recoveryCodeRepository;
        this.sessionService = sessionService;
        this.auditService = auditService;
        this.passwordEncoder = passwordEncoder;
        this.policy = policy;
        this.properties = properties;
        this.clock = clock;
        this.totpKey = SecretKeys.totpKey(properties);
        this.cipher = new TotpCipher(totpKey);
    }

    // --- Self-service entry points (the user is loaded inside the transaction) ---------------------------------

    @Transactional(readOnly = true)
    public TwoFactorStatusResponse statusOf(Long userId) {
        return status(load(userId));
    }

    @Transactional
    public TotpSetupResponse beginSetupFor(Long userId) {
        return beginSetup(load(userId));
    }

    @Transactional
    public List<String> enableFor(Long userId, String code) {
        return enable(load(userId), code, HttpStatus.BAD_REQUEST);
    }

    @Transactional
    public void disableFor(Long userId, String password, String code, String currentSessionId) {
        disable(load(userId), password, code, currentSessionId);
    }

    @Transactional
    public List<String> regenerateRecoveryCodesFor(Long userId, String code) {
        return regenerateRecoveryCodes(load(userId), code);
    }

    private User load(Long userId) {
        return userRepository.findById(userId).orElseThrow(AccountErrors::unauthenticated);
    }

    public boolean isRequired(User user) {
        return user.getRole() != null && policy.isRequired(user.getRole().getCode());
    }

    @Transactional(readOnly = true)
    public TwoFactorStatusResponse status(User user) {
        boolean enabled = Boolean.TRUE.equals(user.getTotpEnabled());
        return TwoFactorStatusResponse.builder()
                .enabled(enabled)
                .enabledAt(enabled ? user.getTotpEnabledAt() : null)
                .required(isRequired(user))
                .recoveryCodesRemaining(enabled ? recoveryCodeRepository.countByUserIdAndUsedAtIsNull(user.getId()) : 0)
                .pendingSetup(!enabled && pendingValid(user, clock.instant()))
                .build();
    }

    /** Stores a new pending secret (replacing any previous one). 409 {@code TOTP_ALREADY_ENABLED}. */
    @Transactional
    public TotpSetupResponse beginSetup(User user) {
        if (Boolean.TRUE.equals(user.getTotpEnabled())) {
            throw AccountErrors.totpAlreadyEnabled();
        }
        Instant now = clock.instant();
        String secret = Base32.encode(SecretKeys.randomBytes(TotpGenerator.SECRET_BYTES));
        user.setTotpPendingSecretEnc(cipher.encrypt(secret));
        user.setTotpPendingCreatedAt(now);
        userRepository.save(user);
        return TotpSetupResponse.builder()
                .secret(secret)
                .otpauthUri(TotpGenerator.otpauthUri(properties.getSecurity().getTotp().getIssuer(), user.getEmail(), secret))
                .expiresAt(now.plus(PENDING_TTL))
                .build();
    }

    /**
     * Confirms the pending secret with a first code, enables TOTP and returns fresh recovery codes.
     *
     * @param invalidStatus HTTP status of {@code TOTP_CODE_INVALID} (401 during login, 400 in self-service)
     */
    @Transactional(noRollbackFor = com.example.zelqanepfe.exception.ApiException.class)
    public List<String> enable(User user, String code, HttpStatus invalidStatus) {
        if (Boolean.TRUE.equals(user.getTotpEnabled())) {
            throw AccountErrors.totpAlreadyEnabled();
        }
        Instant now = clock.instant();
        if (!pendingValid(user, now)) {
            throw AccountErrors.totpSetupRequired();
        }
        String secret = decryptOrNull(user.getTotpPendingSecretEnc(), user);
        if (secret == null) {
            throw AccountErrors.totpSetupRequired();
        }
        OptionalLong step = TotpGenerator.verify(Base32.decode(secret), normalizeDigits(code), now, null);
        if (step.isEmpty()) {
            throw AccountErrors.totpCodeInvalid(invalidStatus);
        }
        user.setTotpSecretEnc(user.getTotpPendingSecretEnc());
        user.setTotpEnabled(true);
        user.setTotpEnabledAt(now);
        user.setTotpLastUsedStep(step.getAsLong());
        user.setTotpPendingSecretEnc(null);
        user.setTotpPendingCreatedAt(null);
        userRepository.save(user);
        List<String> codes = replaceRecoveryCodes(user.getId(), now);
        auditService.record("USER_2FA_ENABLED", "USER", user.getId(),
                "Activation de la double authentification de « " + user.getEmail() + " »", null);
        return codes;
    }

    /** Verifies a TOTP code (6 digits) or an unused recovery code; consumes it on success. */
    @Transactional
    public CodeCheck verifyCode(User user, String code) {
        if (!Boolean.TRUE.equals(user.getTotpEnabled()) || code == null) {
            return CodeCheck.INVALID;
        }
        String digits = normalizeDigits(code);
        Instant now = clock.instant();
        if (TotpGenerator.isCodeFormat(digits)) {
            String secret = decryptOrNull(user.getTotpSecretEnc(), user);
            if (secret == null) {
                return CodeCheck.INVALID;
            }
            OptionalLong step = TotpGenerator.verify(Base32.decode(secret), digits, now, user.getTotpLastUsedStep());
            if (step.isEmpty()) {
                return CodeCheck.INVALID;
            }
            user.setTotpLastUsedStep(step.getAsLong());
            userRepository.save(user);
            return CodeCheck.TOTP;
        }
        if (RecoveryCodes.isRecoveryFormat(code)) {
            RecoveryCode stored = recoveryCodeRepository.findByCodeHash(RecoveryCodes.hash(totpKey, user.getId(), code))
                    .filter(c -> c.getUserId().equals(user.getId()) && c.getUsedAt() == null)
                    .orElse(null);
            if (stored == null) {
                return CodeCheck.INVALID;
            }
            stored.setUsedAt(now);
            recoveryCodeRepository.save(stored);
            return CodeCheck.RECOVERY;
        }
        return CodeCheck.INVALID;
    }

    /** Self-service disable: password and a TOTP or recovery code; other sessions are revoked. */
    @Transactional
    public void disable(User user, String password, String code, String currentSessionId) {
        if (isRequired(user)) {
            throw AccountErrors.totpRequiredForRole();
        }
        if (!Boolean.TRUE.equals(user.getTotpEnabled())) {
            throw AccountErrors.totpNotEnabled();
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw AccountErrors.invalidCurrentPassword();
        }
        if (verifyCode(user, code) == CodeCheck.INVALID) {
            throw AccountErrors.totpCodeInvalid(HttpStatus.BAD_REQUEST);
        }
        clear(user);
        int revoked = sessionService.revokeAll(user.getId(), currentSessionId, SessionRevokeReason.REVOKED_BY_USER);
        auditService.record("USER_2FA_DISABLED", "USER", user.getId(),
                "Désactivation de la double authentification de « " + user.getEmail() + " »",
                Map.of("revokedSessions", revoked));
    }

    /** New recovery codes after a valid TOTP code (recovery codes are not accepted here). */
    @Transactional
    public List<String> regenerateRecoveryCodes(User user, String code) {
        if (!Boolean.TRUE.equals(user.getTotpEnabled())) {
            throw AccountErrors.totpNotEnabled();
        }
        if (!TotpGenerator.isCodeFormat(normalizeDigits(code)) || verifyCode(user, code) != CodeCheck.TOTP) {
            throw AccountErrors.totpCodeInvalid(HttpStatus.BAD_REQUEST);
        }
        return replaceRecoveryCodes(user.getId(), clock.instant());
    }

    /** Administrator reset: TOTP off, recovery codes deleted (sessions are revoked by the caller). */
    @Transactional
    public void reset(User user) {
        clear(user);
    }

    private void clear(User user) {
        user.setTotpEnabled(false);
        user.setTotpSecretEnc(null);
        user.setTotpEnabledAt(null);
        user.setTotpLastUsedStep(null);
        user.setTotpPendingSecretEnc(null);
        user.setTotpPendingCreatedAt(null);
        userRepository.save(user);
        recoveryCodeRepository.deleteByUserId(user.getId());
    }

    private List<String> replaceRecoveryCodes(Long userId, Instant now) {
        recoveryCodeRepository.deleteByUserId(userId);
        recoveryCodeRepository.flush();
        List<String> codes = RecoveryCodes.generate();
        recoveryCodeRepository.saveAll(codes.stream()
                .map(c -> RecoveryCode.builder().userId(userId).codeHash(RecoveryCodes.hash(totpKey, userId, c))
                        .createdAt(now).build())
                .toList());
        return codes;
    }

    private static boolean pendingValid(User user, Instant now) {
        return user.getTotpPendingSecretEnc() != null && user.getTotpPendingCreatedAt() != null
                && user.getTotpPendingCreatedAt().plus(PENDING_TTL).isAfter(now);
    }

    private String decryptOrNull(String stored, User user) {
        if (stored == null) {
            return null;
        }
        try {
            return cipher.decrypt(stored);
        } catch (IllegalStateException ex) {
            log.warn("Secret TOTP de l'utilisateur {} illisible (clé TOTP modifiée ?) : réinitialisation requise.",
                    user.getId());
            return null;
        }
    }

    /** Removes spaces a user may type inside a 6-digit code ("123 456"). */
    static String normalizeDigits(String code) {
        return code == null ? null : code.replace(" ", "").trim();
    }
}
