package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminUserCreateRequest;
import com.example.tpubpfe.dto.AdminUserResponse;
import com.example.tpubpfe.dto.AdminUserUpdateRequest;
import com.example.tpubpfe.dto.ClientValidationRequest;
import com.example.tpubpfe.dto.LoginHistoryResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.RevokedCountResponse;
import com.example.tpubpfe.dto.RoleResponse;
import com.example.tpubpfe.dto.SessionResponse;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SessionRevokeReason;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.UserSessionRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.security.totp.TotpPolicy;
import com.example.tpubpfe.service.storage.FileStorageService;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Back-office management of user and client accounts ({@code /api/admin/users}, {@code /api/admin/clients}). */
@Service
@RequiredArgsConstructor
public class AdminUserService {

    public static final Set<RoleCode> STAFF_ROLES = Set.of(RoleCode.ADMINISTRATEUR, RoleCode.OPERATEUR, RoleCode.SUPERVISEUR);
    private static final int MAX_PAGE_SIZE = 100;
    private static final Map<String, String> SORT_FIELDS = Map.of(
            "createdAt", "createdAt",
            "email", "email",
            "nom", "nom",
            "lastLoginAt", "lastLoginAt");

    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final RoleRepository roleRepository;
    private final UserSessionRepository sessionRepository;
    private final SessionService sessionService;
    private final LoginHistoryService loginHistoryService;
    private final AuditService auditService;
    private final PasswordEncoder passwordEncoder;
    private final FileStorageService fileStorageService;
    private final Clock clock;
    private final TotpPolicy totpPolicy;
    private final TwoFactorService twoFactorService;

    /** Filters of {@code GET /api/admin/users}; empty lists and nulls mean "any". */
    public record Filter(String q, List<RoleCode> roles, Boolean active, List<ClientValidationStatus> validationStatuses) {
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> search(Filter filter, int page, int size, String sort) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)), parseSort(sort));
        Page<User> users = userRepository.findAll(specification(filter), pageable);
        List<AdminUserResponse> items = toResponses(users.getContent());
        return PageResponse.<AdminUserResponse>builder()
                .items(items)
                .page(users.getNumber())
                .size(users.getSize())
                .totalItems(users.getTotalElements())
                .totalPages(users.getTotalPages())
                .build();
    }

    @Transactional(readOnly = true)
    public AdminUserResponse get(Long id) {
        return toResponse(find(id));
    }

    @Transactional
    public AdminUserResponse create(AdminUserCreateRequest request) {
        if (request.getRole() == null || !STAFF_ROLES.contains(request.getRole())) {
            throw AccountErrors.roleNotAllowed(
                    "Seuls les rôles ADMINISTRATEUR, OPERATEUR et SUPERVISEUR peuvent être créés ici.");
        }
        String email = AuthService.normalizeEmail(request.getEmail());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw AccountErrors.emailAlreadyRegistered();
        }
        User user = userRepository.save(User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(role(request.getRole()))
                .nom(request.getNom().trim())
                .societe(AuthService.blankToNull(request.getSociete()))
                .telephone(AuthService.blankToNull(request.getTelephone()))
                .isActive(true)
                .build());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("email", user.getEmail());
        details.put("role", request.getRole().name());
        auditService.record("USER_CREATED", "USER", user.getId(),
                "Création du compte " + request.getRole().name() + " « " + user.getEmail() + " »", details);
        return toResponse(user);
    }

    @Transactional
    public AdminUserResponse update(Long id, AdminUserUpdateRequest request) {
        User user = find(id);
        RoleCode currentRole = user.getRole().getCode();
        Map<String, Object> changes = new LinkedHashMap<>();
        if (request.getRole() != null && request.getRole() != currentRole) {
            if (Objects.equals(user.getId(), SecurityUtils.getCurrentUser().getId())) {
                throw AccountErrors.roleNotAllowed("Vous ne pouvez pas modifier votre propre rôle.");
            }
            if (!STAFF_ROLES.contains(currentRole) || !STAFF_ROLES.contains(request.getRole())) {
                throw AccountErrors.roleNotAllowed("Le rôle ne peut être changé qu'entre rôles internes "
                        + "(ADMINISTRATEUR, OPERATEUR, SUPERVISEUR).");
            }
            if (currentRole == RoleCode.ADMINISTRATEUR && Boolean.TRUE.equals(user.getIsActive())
                    && userRepository.countActiveByRoleCode(RoleCode.ADMINISTRATEUR) <= 1) {
                throw AccountErrors.lastAdmin();
            }
            changes.put("role", Map.of("from", currentRole.name(), "to", request.getRole().name()));
            user.setRole(role(request.getRole()));
        }
        track(changes, "nom", user.getNom(), request.getNom().trim());
        track(changes, "societe", user.getSociete(), AuthService.blankToNull(request.getSociete()));
        track(changes, "telephone", user.getTelephone(), AuthService.blankToNull(request.getTelephone()));
        track(changes, "adresse", user.getAdresse(), AuthService.blankToNull(request.getAdresse()));
        user.setNom(request.getNom().trim());
        user.setSociete(AuthService.blankToNull(request.getSociete()));
        user.setTelephone(AuthService.blankToNull(request.getTelephone()));
        user.setAdresse(AuthService.blankToNull(request.getAdresse()));
        userRepository.save(user);
        clientRepository.findByUserId(user.getId()).ifPresent(client -> {
            client.setCompanyName(user.getSociete());
            clientRepository.save(client);
        });
        auditService.record("USER_UPDATED", "USER", user.getId(),
                "Modification du compte « " + user.getEmail() + " »", changes);
        return toResponse(user);
    }

    @Transactional
    public AdminUserResponse activate(Long id) {
        User user = find(id);
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            user.setIsActive(true);
            userRepository.save(user);
        }
        auditService.record("USER_ACTIVATED", "USER", user.getId(),
                "Activation du compte « " + user.getEmail() + " »", null);
        return toResponse(user);
    }

    /** Self → {@code CANNOT_DEACTIVATE_SELF}; last active admin → {@code LAST_ADMIN}; revokes every session. */
    @Transactional
    public AdminUserResponse deactivate(Long id) {
        User user = find(id);
        if (Objects.equals(user.getId(), SecurityUtils.getCurrentUser().getId())) {
            throw AccountErrors.cannotDeactivateSelf();
        }
        if (user.getRole().getCode() == RoleCode.ADMINISTRATEUR && Boolean.TRUE.equals(user.getIsActive())
                && userRepository.countActiveByRoleCode(RoleCode.ADMINISTRATEUR) <= 1) {
            throw AccountErrors.lastAdmin();
        }
        user.setIsActive(false);
        userRepository.save(user);
        int revoked = sessionService.revokeAll(user.getId(), null, SessionRevokeReason.ACCOUNT_DISABLED);
        auditService.record("USER_DEACTIVATED", "USER", user.getId(),
                "Désactivation du compte « " + user.getEmail() + " »", Map.of("revokedSessions", revoked));
        return toResponse(user);
    }

    @Transactional
    public AdminUserResponse changeClientValidation(Long clientId, ClientValidationRequest request) {
        Client client = clientRepository.findById(clientId).orElseThrow(AccountErrors::clientNotFound);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("clientId", client.getId());
        details.put("from", client.getValidationStatus() == null ? null : client.getValidationStatus().name());
        details.put("to", request.getValidationStatus().name());
        client.setValidationStatus(request.getValidationStatus());
        if (request.getTrustLevel() != null) {
            details.put("trustLevel", request.getTrustLevel());
            client.setTrustLevel(request.getTrustLevel().shortValue());
        }
        if (request.getNotes() != null) {
            client.setNotes(AuthService.blankToNull(request.getNotes()));
            details.put("notes", client.getNotes());
        }
        clientRepository.save(client);
        User user = client.getUser();
        auditService.record("CLIENT_VALIDATION_CHANGED", "CLIENT", client.getId(),
                "Statut de l'annonceur « " + user.getEmail() + " » : "
                        + request.getValidationStatus().name(), details);
        return toResponse(user);
    }

    @Transactional(readOnly = true)
    public List<LoginHistoryResponse> loginHistory(Long id, Integer limit) {
        return loginHistoryService.list(find(id).getId(), limit);
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> sessions(Long id) {
        UserDetailsImpl principal = SecurityUtils.currentUserOrNull();
        return sessionService.listActive(find(id).getId(), principal == null ? null : principal.getSessionId());
    }

    @Transactional
    public RevokedCountResponse revokeSessions(Long id) {
        User user = find(id);
        int revoked = sessionService.revokeAll(user.getId(), null, SessionRevokeReason.REVOKED_BY_ADMIN);
        auditService.record("USER_SESSIONS_REVOKED", "USER", user.getId(),
                "Fermeture des sessions de « " + user.getEmail() + " »", Map.of("revoked", revoked));
        return RevokedCountResponse.builder().revoked(revoked).build();
    }

    /** Round 2: forces a new password at next request and closes every session. Never on self. */
    @Transactional
    public AdminUserResponse requirePasswordChange(Long id) {
        User user = find(id);
        ensureNotSelf(user, "Vous ne pouvez pas exiger ce changement sur votre propre compte.");
        user.setMustChangePassword(true);
        userRepository.save(user);
        int revoked = sessionService.revokeAll(user.getId(), null, SessionRevokeReason.REVOKED_BY_ADMIN);
        auditService.record("USER_PASSWORD_CHANGE_REQUIRED", "USER", user.getId(),
                "Changement de mot de passe exigé pour « " + user.getEmail() + " »", Map.of("revokedSessions", revoked));
        return toResponse(user);
    }

    /** Round 2: disables TOTP, deletes recovery codes and closes every session. Never on self. */
    @Transactional
    public AdminUserResponse resetTwoFactor(Long id) {
        User user = find(id);
        ensureNotSelf(user, "Vous ne pouvez pas réinitialiser votre propre double authentification.");
        twoFactorService.reset(user);
        int revoked = sessionService.revokeAll(user.getId(), null, SessionRevokeReason.REVOKED_BY_ADMIN);
        auditService.record("USER_2FA_RESET", "USER", user.getId(),
                "Réinitialisation de la double authentification de « " + user.getEmail() + " »",
                Map.of("revokedSessions", revoked));
        return toResponse(user);
    }

    private static void ensureNotSelf(User user, String message) {
        UserDetailsImpl principal = SecurityUtils.currentUserOrNull();
        if (principal != null && Objects.equals(principal.getId(), user.getId())) {
            throw AccountErrors.roleNotAllowed(message);
        }
    }

    @Transactional(readOnly = true)
    public List<RoleResponse> roles() {
        return roleRepository.findAllByOrderByIdAsc().stream()
                .map(role -> RoleResponse.builder()
                        .code(role.getCode().name())
                        .name(role.getName())
                        .description(role.getDescription())
                        .permissions(role.getPermissions() == null ? List.of() : List.copyOf(role.getPermissions()))
                        .build())
                .toList();
    }

    private User find(Long id) {
        return userRepository.findById(id).orElseThrow(AccountErrors::userNotFound);
    }

    private Role role(RoleCode code) {
        return roleRepository.findByCode(code).orElseThrow(() -> new com.example.tpubpfe.exception.ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Rôle " + code.name() + " absent de la base."));
    }

    private static void track(Map<String, Object> changes, String field, String before, String after) {
        if (!Objects.equals(before, after)) {
            Map<String, Object> change = new HashMap<>();
            change.put("from", before);
            change.put("to", after);
            changes.put(field, change);
        }
    }

    AdminUserResponse toResponse(User user) {
        return toResponses(List.of(user)).get(0);
    }

    private List<AdminUserResponse> toResponses(List<User> users) {
        if (users.isEmpty()) {
            return List.of();
        }
        List<Long> userIds = users.stream().map(User::getId).toList();
        Map<Long, Client> clientsByUser = clientRepository.findByUserIdIn(userIds).stream()
                .collect(Collectors.toMap(c -> c.getUser().getId(), Function.identity(), (a, b) -> a));
        Map<Long, Long> sessions = counts(sessionRepository.countActiveByUserIds(userIds, clock.instant()));
        List<Long> clientIds = clientsByUser.values().stream().map(Client::getId).toList();
        Map<Long, Long> campaigns = clientIds.isEmpty() ? Map.of() : counts(clientRepository.countCampaignsByClientIds(clientIds));
        List<AdminUserResponse> responses = new ArrayList<>(users.size());
        for (User user : users) {
            Client client = clientsByUser.get(user.getId());
            responses.add(MeService.fill(AdminUserResponse.builder(), user, client, fileStorageService, totpPolicy)
                    .activeSessions(sessions.getOrDefault(user.getId(), 0L))
                    .campaignsCount(client == null ? 0L : campaigns.getOrDefault(client.getId(), 0L))
                    .clientNotes(client == null ? null : client.getNotes())
                    .build());
        }
        return responses;
    }

    private static Map<Long, Long> counts(List<Object[]> rows) {
        Map<Long, Long> result = new HashMap<>();
        for (Object[] row : rows) {
            result.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return result;
    }

    static Specification<User> specification(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.q() != null && !filter.q().isBlank()) {
                String like = "%" + filter.q().trim().toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("email")), like, '\\'),
                        cb.like(cb.lower(root.get("nom")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("societe"), "")), like, '\\')));
            }
            if (filter.roles() != null && !filter.roles().isEmpty()) {
                predicates.add(root.get("role").get("code").in(filter.roles()));
            }
            if (filter.active() != null) {
                predicates.add(cb.equal(root.get("isActive"), filter.active()));
            }
            if (filter.validationStatuses() != null && !filter.validationStatuses().isEmpty()) {
                Subquery<Long> sub = query.subquery(Long.class);
                Root<Client> client = sub.from(Client.class);
                sub.select(client.get("id")).where(
                        cb.equal(client.get("user"), root),
                        client.get("validationStatus").in(filter.validationStatuses()));
                predicates.add(cb.exists(sub));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        }
        String[] parts = sort.split(",");
        String field = SORT_FIELDS.get(parts[0].trim());
        if (field == null) {
            throw CampaignErrors.invalidParameter("sort", "Tri invalide : utilisez createdAt, email, nom ou lastLoginAt.");
        }
        Sort.Direction direction = Sort.Direction.DESC;
        if (parts.length > 1) {
            String dir = parts[1].trim().toLowerCase(Locale.ROOT);
            if ("asc".equals(dir)) {
                direction = Sort.Direction.ASC;
            } else if (!"desc".equals(dir)) {
                throw CampaignErrors.invalidParameter("sort", "Sens de tri invalide : utilisez asc ou desc.");
            }
        }
        return Sort.by(new Sort.Order(direction, field), Sort.Order.desc("id"));
    }
}
