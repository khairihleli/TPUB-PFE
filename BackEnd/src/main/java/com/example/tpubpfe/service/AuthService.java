package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AuthResponse;
import com.example.tpubpfe.dto.LoginRequest;
import com.example.tpubpfe.dto.RegisterRequest;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.LoginFailureReason;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.security.RequestInfo;
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
     * knows its password. Every attempt is written to {@code login_history}.
     */
    @Transactional
    public AuthResponse login(LoginRequest request) {
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

        user.setLastLoginAt(clock.instant());
        userRepository.save(user);

        SessionService.IssuedSession issued = sessionService.open(user, http);
        loginHistoryService.recordSuccess(user.getId(), user.getEmail(), issued.session().getId(), http);
        return toResponse(user, issued);
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
                .build();
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
