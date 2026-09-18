package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.LoginHistoryResponse;
import com.example.zelqanepfe.dto.MeResponse;
import com.example.zelqanepfe.dto.MeUpdateRequest;
import com.example.zelqanepfe.dto.PasswordChangeRequest;
import com.example.zelqanepfe.dto.RevokedCountResponse;
import com.example.zelqanepfe.dto.SessionResponse;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.SessionRevokeReason;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.ClientRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.security.totp.TotpPolicy;
import com.example.zelqanepfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.util.List;
import java.util.Map;

/** Profile, password, logo, sessions and login history of the connected user ({@code /api/me}). */
@Service
@RequiredArgsConstructor
public class MeService {

    public static final long MAX_LOGO_BYTES = 2L * 1024 * 1024;
    private static final Map<String, String> LOGO_EXTENSIONS = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/webp", "webp");

    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessionService;
    private final LoginHistoryService loginHistoryService;
    private final FileStorageService fileStorageService;
    private final Clock clock;
    private final TotpPolicy totpPolicy;

    @Transactional(readOnly = true)
    public MeResponse get() {
        User user = currentUser();
        return toResponse(user, clientRepository.findByUserId(user.getId()).orElse(null), fileStorageService, totpPolicy);
    }

    @Transactional
    public MeResponse update(MeUpdateRequest request) {
        User user = currentUser();
        user.setNom(request.getNom().trim());
        user.setSociete(AuthService.blankToNull(request.getSociete()));
        user.setTelephone(AuthService.blankToNull(request.getTelephone()));
        user.setAdresse(AuthService.blankToNull(request.getAdresse()));
        userRepository.save(user);
        Client client = clientRepository.findByUserId(user.getId()).orElse(null);
        if (client != null) {
            client.setCompanyName(user.getSociete());
            clientRepository.save(client);
        }
        return toResponse(user, client, fileStorageService, totpPolicy);
    }

    /**
     * Changes the password, clears {@code must_change_password} and revokes every other session
     * ({@code PASSWORD_CHANGED}); the current one stays.
     */
    @Transactional
    public void changePassword(PasswordChangeRequest request) {
        User user = currentUser();
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw AccountErrors.invalidCurrentPassword();
        }
        if (passwordEncoder.matches(request.getNewPassword(), user.getPasswordHash())) {
            throw AccountErrors.passwordReused();
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordChangedAt(clock.instant());
        user.setMustChangePassword(false);
        userRepository.save(user);
        sessionService.revokeAll(user.getId(), SecurityUtils.currentSessionId(), SessionRevokeReason.PASSWORD_CHANGED);
    }

    /** PNG/JPEG/WEBP (sniffed from the bytes), ≤ 2 Mo, stored under {@code logos/{userId}/}. */
    @Transactional
    public MeResponse uploadLogo(MultipartFile file) {
        User user = currentUser();
        if (file == null || file.isEmpty()) {
            throw CampaignErrors.validationFailed("file", "Champ obligatoire.");
        }
        if (file.getSize() > MAX_LOGO_BYTES) {
            throw AccountErrors.logoTooLarge();
        }
        String mime = FileStorageService.sniffMime(head(file)).orElse(null);
        String extension = mime == null ? null : LOGO_EXTENSIONS.get(mime);
        if (extension == null) {
            throw AccountErrors.logoTypeUnsupported();
        }
        FileStorageService.StoredFile stored = fileStorageService.store(file, "logos/" + user.getId(), extension);
        String previous = user.getLogoUrl();
        user.setLogoUrl(stored.relativePath());
        userRepository.save(user);
        deleteStoredLogo(previous);
        return toResponse(user, clientRepository.findByUserId(user.getId()).orElse(null), fileStorageService, totpPolicy);
    }

    @Transactional
    public MeResponse deleteLogo() {
        User user = currentUser();
        String previous = user.getLogoUrl();
        user.setLogoUrl(null);
        userRepository.save(user);
        deleteStoredLogo(previous);
        return toResponse(user, clientRepository.findByUserId(user.getId()).orElse(null), fileStorageService, totpPolicy);
    }

    public List<SessionResponse> sessions() {
        UserDetailsImpl principal = SecurityUtils.getCurrentUser();
        return sessionService.listActive(principal.getId(), principal.getSessionId());
    }

    public void revokeSession(String sessionId) {
        sessionService.revokeOwn(SecurityUtils.getCurrentUser().getId(), sessionId, SessionRevokeReason.REVOKED_BY_USER);
    }

    public RevokedCountResponse revokeOtherSessions() {
        UserDetailsImpl principal = SecurityUtils.getCurrentUser();
        int revoked = sessionService.revokeAll(principal.getId(), principal.getSessionId(),
                SessionRevokeReason.REVOKED_BY_USER);
        return RevokedCountResponse.builder().revoked(revoked).build();
    }

    public void logout() {
        sessionService.revokeIfActive(SecurityUtils.getCurrentUser().getSessionId(), SessionRevokeReason.LOGOUT);
    }

    public List<LoginHistoryResponse> loginHistory(Integer limit) {
        return loginHistoryService.list(SecurityUtils.getCurrentUser().getId(), limit);
    }

    private User currentUser() {
        return userRepository.findById(SecurityUtils.getCurrentUser().getId())
                .orElseThrow(AccountErrors::unauthenticated);
    }

    /** Only files stored by the platform (relative paths) are deleted; external URLs are left alone. */
    private void deleteStoredLogo(String logo) {
        if (isStoredPath(logo)) {
            fileStorageService.delete(logo);
        }
    }

    static boolean isStoredPath(String logo) {
        return logo != null && !logo.isBlank() && !logo.startsWith("/") && !logo.contains("://");
    }

    private static byte[] head(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(16);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** Shared by the admin users API. */
    static MeResponse toResponse(User user, Client client, FileStorageService storage, TotpPolicy policy) {
        return fill(MeResponse.builder(), user, client, storage, policy).build();
    }

    static <B extends MeResponse.MeResponseBuilder<?, ?>> B fill(B builder, User user, Client client,
                                                                 FileStorageService storage, TotpPolicy policy) {
        builder.twoFactorEnabled(Boolean.TRUE.equals(user.getTotpEnabled()))
                .twoFactorRequired(user.getRole() != null && policy.isRequired(user.getRole().getCode()))
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()));
        builder.userId(user.getId())
                .email(user.getEmail())
                .nom(user.getNom())
                .role(user.getRole() == null || user.getRole().getCode() == null ? null : user.getRole().getCode().name())
                .societe(user.getSociete())
                .telephone(user.getTelephone())
                .adresse(user.getAdresse())
                .logoUrl(logoUrl(user.getLogoUrl(), storage))
                .isActive(Boolean.TRUE.equals(user.getIsActive()))
                .lastLoginAt(user.getLastLoginAt())
                .createdAt(user.getCreatedAt())
                .client(client == null ? null : MeResponse.ClientInfo.builder()
                        .clientId(client.getId())
                        .companyName(client.getCompanyName())
                        .validationStatus(client.getValidationStatus() == null ? null : client.getValidationStatus().name())
                        .trustLevel(client.getTrustLevel() == null ? 0 : client.getTrustLevel())
                        .build());
        return builder;
    }

    static String logoUrl(String stored, FileStorageService storage) {
        if (stored == null || stored.isBlank()) {
            return null;
        }
        return isStoredPath(stored) ? storage.publicUrl(stored) : stored;
    }
}
