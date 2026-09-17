package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.MeResponse;
import com.example.tpubpfe.dto.MeUpdateRequest;
import com.example.tpubpfe.dto.PasswordChangeRequest;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SessionRevokeReason;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
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

class MeServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-17T08:00:00Z");

    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private UserRepository userRepository;
    private ClientRepository clientRepository;
    private SessionService sessionService;
    private FileStorageService storage;
    private MeService service;
    private User user;
    private Client client;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        clientRepository = mock(ClientRepository.class);
        sessionService = mock(SessionService.class);
        storage = mock(FileStorageService.class);
        when(storage.publicUrl(anyString())).thenAnswer(inv -> "/uploads/" + inv.getArgument(0));
        service = new MeService(userRepository, clientRepository, encoder, sessionService,
                mock(LoginHistoryService.class), storage, Clock.fixed(NOW, ZoneId.of("Africa/Tunis")));
        user = User.builder().id(9L).email("ann@tpub.test").nom("Ann").passwordHash(encoder.encode("Ancien123"))
                .role(Role.builder().code(RoleCode.ANNONCEUR).name("Annonceur").build()).isActive(true)
                .logoUrl("logos/9/old.png").build();
        client = Client.builder().id(90L).user(user).companyName("Old").validationStatus(ClientValidationStatus.VALIDATED)
                .trustLevel((short) 40).build();
        when(userRepository.findById(9L)).thenReturn(Optional.of(user));
        when(clientRepository.findByUserId(9L)).thenReturn(Optional.of(client));
        UserDetailsImpl principal = new UserDetailsImpl(9L, "ann@tpub.test", "x", "Ann", "ANNONCEUR", true, "current-sid");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getMapsProfileClientAndLogoUrl() {
        MeResponse me = service.get();

        assertThat(me.getLogoUrl()).isEqualTo("/uploads/logos/9/old.png");
        assertThat(me.getClient().getValidationStatus()).isEqualTo("VALIDATED");
        assertThat(me.getClient().getTrustLevel()).isEqualTo(40);
    }

    @Test
    void updateSyncsCompanyNameAndBlanksBecomeNull() {
        MeResponse me = service.update(MeUpdateRequest.builder().nom(" Ann B ").societe(" Nouvelle SARL ")
                .telephone("  ").adresse(null).build());

        assertThat(me.getNom()).isEqualTo("Ann B");
        assertThat(user.getTelephone()).isNull();
        assertThat(client.getCompanyName()).isEqualTo("Nouvelle SARL");
    }

    @Test
    void passwordChangeChecksCurrentAndReuse() {
        assertThatThrownBy(() -> service.changePassword(new PasswordChangeRequest("faux", "Nouveau123")))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("INVALID_CURRENT_PASSWORD"));
        assertThatThrownBy(() -> service.changePassword(new PasswordChangeRequest("Ancien123", "Ancien123")))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("PASSWORD_REUSED"));
        verify(sessionService, never()).revokeAll(any(), any(), any());
    }

    @Test
    void passwordChangeRevokesOtherSessionsOnly() {
        service.changePassword(new PasswordChangeRequest("Ancien123", "Nouveau123"));

        assertThat(encoder.matches("Nouveau123", user.getPasswordHash())).isTrue();
        assertThat(user.getPasswordChangedAt()).isEqualTo(NOW);
        verify(sessionService).revokeAll(9L, "current-sid", SessionRevokeReason.PASSWORD_CHANGED);
    }

    @Test
    void logoIsSniffedSizedAndReplacesThePreviousFile() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13};
        assertThatThrownBy(() -> service.uploadLogo(new MockMultipartFile("file", "a.png", "image/png", "GIF89a....".getBytes())))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("MEDIA_TYPE_UNSUPPORTED"));
        byte[] big = new byte[(int) MeService.MAX_LOGO_BYTES + 1];
        System.arraycopy(png, 0, big, 0, png.length);
        assertThatThrownBy(() -> service.uploadLogo(new MockMultipartFile("file", "a.png", "image/png", big)))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getCode()).isEqualTo("MEDIA_TOO_LARGE"));

        when(storage.store(any(), eq("logos/9"), eq("png")))
                .thenReturn(new FileStorageService.StoredFile("logos/9/new.png", png.length, "sha"));
        MeResponse me = service.uploadLogo(new MockMultipartFile("file", "logo.bin", "application/octet-stream", png));

        assertThat(me.getLogoUrl()).isEqualTo("/uploads/logos/9/new.png");
        verify(storage).delete("logos/9/old.png");
    }

    @Test
    void externalLogoUrlsAreNeverDeleted() {
        user.setLogoUrl("https://cdn.example.org/logo.png");
        MeResponse me = service.deleteLogo();

        assertThat(me.getLogoUrl()).isNull();
        verify(storage, never()).delete(anyString());
    }
}
