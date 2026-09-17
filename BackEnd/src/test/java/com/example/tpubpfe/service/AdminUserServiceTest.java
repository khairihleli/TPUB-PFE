package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AdminUserCreateRequest;
import com.example.tpubpfe.dto.AdminUserUpdateRequest;
import com.example.tpubpfe.dto.ClientValidationRequest;
import com.example.tpubpfe.exception.ApiException;
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
import com.example.tpubpfe.service.storage.FileStorageService;
import org.assertj.core.api.ThrowableAssert;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminUserServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-17T08:00:00Z"), ZoneId.of("Africa/Tunis"));

    private UserRepository userRepository;
    private ClientRepository clientRepository;
    private RoleRepository roleRepository;
    private SessionService sessionService;
    private AuditService auditService;
    private AdminUserService service;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        clientRepository = mock(ClientRepository.class);
        roleRepository = mock(RoleRepository.class);
        UserSessionRepository sessionRepository = mock(UserSessionRepository.class);
        sessionService = mock(SessionService.class);
        auditService = mock(AuditService.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenAnswer(inv -> "hash:" + inv.getArgument(0));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) {
                u.setId(50L);
            }
            return u;
        });
        for (RoleCode code : RoleCode.values()) {
            when(roleRepository.findByCode(code)).thenReturn(Optional.of(role(code)));
        }
        when(sessionRepository.countActiveByUserIds(anyCollection(), any())).thenReturn(List.of());
        when(clientRepository.findByUserIdIn(anyCollection())).thenReturn(List.of());
        service = new AdminUserService(userRepository, clientRepository, roleRepository, sessionRepository,
                sessionService, mock(LoginHistoryService.class), auditService, encoder,
                mock(FileStorageService.class), CLOCK);
        TestAuth.login(1L, "ADMINISTRATEUR");
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    private static Role role(RoleCode code) {
        return Role.builder().code(code).name(code.name()).build();
    }

    private User user(long id, RoleCode code, boolean active) {
        User user = User.builder().id(id).email("u" + id + "@tpub.test").nom("U" + id).passwordHash("h")
                .role(role(code)).isActive(active).build();
        when(userRepository.findById(id)).thenReturn(Optional.of(user));
        return user;
    }

    @Test
    void createRejectsAnnonceurAndDuplicateEmail() {
        AdminUserCreateRequest annonceur = AdminUserCreateRequest.builder().email("x@tpub.test").password("secret123")
                .nom("X").role(RoleCode.ANNONCEUR).build();
        assertCode(() -> service.create(annonceur), "ROLE_NOT_ALLOWED");

        when(userRepository.existsByEmailIgnoreCase("dup@tpub.test")).thenReturn(true);
        AdminUserCreateRequest duplicate = AdminUserCreateRequest.builder().email(" Dup@TPUB.test ").password("secret123")
                .nom("D").role(RoleCode.OPERATEUR).build();
        assertCode(() -> service.create(duplicate), "EMAIL_ALREADY_REGISTERED");
        verify(userRepository, never()).save(any());
    }

    @Test
    void createStaffNormalizesEmailAndAudits() {
        AdminUserCreateRequest request = AdminUserCreateRequest.builder().email(" New.Op@TPUB.test ").password("secret123")
                .nom(" Opérateur ").role(RoleCode.OPERATEUR).build();

        var response = service.create(request);

        assertThat(response.getEmail()).isEqualTo("new.op@tpub.test");
        assertThat(response.getRole()).isEqualTo("OPERATEUR");
        assertThat(response.getIsActive()).isTrue();
        assertThat(response.getCampaignsCount()).isZero();
        verify(auditService).record(eq("USER_CREATED"), eq("USER"), eq(50L), anyString(), anyMap());
    }

    @Test
    void deactivateSelfAndLastAdminAreRefused() {
        user(1L, RoleCode.ADMINISTRATEUR, true);
        assertCode(() -> service.deactivate(1L), "CANNOT_DEACTIVATE_SELF");

        user(2L, RoleCode.ADMINISTRATEUR, true);
        when(userRepository.countActiveByRoleCode(RoleCode.ADMINISTRATEUR)).thenReturn(1L);
        assertCode(() -> service.deactivate(2L), "LAST_ADMIN");
        verify(sessionService, never()).revokeAll(any(), any(), any());
    }

    @Test
    void deactivateRevokesEverySessionAndAudits() {
        User target = user(3L, RoleCode.ANNONCEUR, true);
        when(sessionService.revokeAll(3L, null, SessionRevokeReason.ACCOUNT_DISABLED)).thenReturn(2);

        service.deactivate(3L);

        assertThat(target.getIsActive()).isFalse();
        verify(sessionService).revokeAll(eq(3L), isNull(), eq(SessionRevokeReason.ACCOUNT_DISABLED));
        verify(auditService).record(eq("USER_DEACTIVATED"), eq("USER"), eq(3L), anyString(),
                eq(Map.of("revokedSessions", 2)));
    }

    @Test
    void unknownUserIs404() {
        when(userRepository.findById(404L)).thenReturn(Optional.empty());
        assertCode(() -> service.get(404L), "USER_NOT_FOUND");
    }

    @Test
    void roleChangeRules() {
        user(1L, RoleCode.ADMINISTRATEUR, true);
        assertCode(() -> service.update(1L, update(RoleCode.SUPERVISEUR)), "ROLE_NOT_ALLOWED");

        user(4L, RoleCode.ANNONCEUR, true);
        assertCode(() -> service.update(4L, update(RoleCode.OPERATEUR)), "ROLE_NOT_ALLOWED");

        User operator = user(5L, RoleCode.OPERATEUR, true);
        assertCode(() -> service.update(5L, update(RoleCode.ANNONCEUR)), "ROLE_NOT_ALLOWED");

        service.update(5L, update(RoleCode.SUPERVISEUR));
        assertThat(operator.getRole().getCode()).isEqualTo(RoleCode.SUPERVISEUR);
        verify(auditService).record(eq("USER_UPDATED"), eq("USER"), eq(5L), anyString(), anyMap());
    }

    @Test
    void clientValidationUpdatesStatusTrustAndNotes() {
        User owner = user(6L, RoleCode.ANNONCEUR, true);
        Client client = Client.builder().id(60L).user(owner).validationStatus(ClientValidationStatus.PENDING).build();
        when(clientRepository.findById(60L)).thenReturn(Optional.of(client));
        when(clientRepository.findById(61L)).thenReturn(Optional.empty());

        service.changeClientValidation(60L, ClientValidationRequest.builder()
                .validationStatus(ClientValidationStatus.SUSPENDED).trustLevel(20).notes("  Paiement en retard ").build());

        assertThat(client.getValidationStatus()).isEqualTo(ClientValidationStatus.SUSPENDED);
        assertThat(client.getTrustLevel()).isEqualTo((short) 20);
        assertThat(client.getNotes()).isEqualTo("Paiement en retard");
        verify(auditService).record(eq("CLIENT_VALIDATION_CHANGED"), eq("CLIENT"), eq(60L), anyString(), anyMap());
        assertCode(() -> service.changeClientValidation(61L, ClientValidationRequest.builder()
                .validationStatus(ClientValidationStatus.VALIDATED).build()), "CLIENT_NOT_FOUND");
    }

    private static AdminUserUpdateRequest update(RoleCode role) {
        return AdminUserUpdateRequest.builder().nom("Nom").role(role).build();
    }

    private static void assertCode(ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.getCode()).isEqualTo(code));
    }
}
