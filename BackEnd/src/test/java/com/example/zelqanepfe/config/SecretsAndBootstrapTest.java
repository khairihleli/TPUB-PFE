package com.example.zelqanepfe.config;

import com.example.zelqanepfe.model.Role;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.RoleRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.SecretKeys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SecretsAndBootstrapTest {

    private ZelqaneProperties properties;

    @BeforeEach
    void setUp() {
        properties = new ZelqaneProperties();
    }

    @Test
    void jwtSecretMustExistBeLongAndNotCompromised() {
        assertThatThrownBy(() -> SecretsValidator.validate(properties))
                .isInstanceOf(IllegalStateException.class).hasMessage(SecretsValidator.MISSING_MESSAGE);
        properties.getJwt().setSecret("trop-court");
        assertThatThrownBy(() -> SecretsValidator.validate(properties)).hasMessage(SecretsValidator.MISSING_MESSAGE);

        properties.getJwt().setSecret("change_me_jwt_secret_min_32_characters_long");
        assertThatThrownBy(() -> SecretsValidator.validate(properties)).hasMessage(SecretsValidator.COMPROMISED_MESSAGE);
        properties.getJwt().setSecret(historicalHexSecret());
        assertThatThrownBy(() -> SecretsValidator.validate(properties)).hasMessage(SecretsValidator.COMPROMISED_MESSAGE);

        properties.getJwt().setSecret("a-fresh-secret-with-more-than-32-bytes-0123456789");
        SecretsValidator.validate(properties);
    }

    @Test
    void placeholdersCopiedFromEnvExampleAreRefused() {
        properties.getJwt().setSecret("<générez 64 caractères hexadécimaux>");
        assertThatThrownBy(() -> SecretsValidator.validate(properties))
                .hasMessageStartingWith("JWT_SECRET contient encore la valeur d'exemple");
        properties.getJwt().setSecret("a-fresh-secret-with-more-than-32-bytes-0123456789");
        properties.getMedia().setSigningSecret(" <générez 64 caractères hexadécimaux> ");
        assertThatThrownBy(() -> SecretsValidator.validate(properties))
                .hasMessageStartingWith("MEDIA_SIGNING_SECRET");
        properties.getMedia().setSigningSecret("");
        properties.getSecurity().getTotp().setEncryptionKey("<clé>");
        assertThatThrownBy(() -> SecretsValidator.validate(properties))
                .hasMessageStartingWith("TOTP_ENCRYPTION_KEY");
        properties.getSecurity().getTotp().setEncryptionKey(null);
        SecretsValidator.validate(properties);
    }

    /** Rebuilt from pieces so that the compromised value never appears verbatim in the sources. */
    private static String historicalHexSecret() {
        return "b157b9619183d271ce6e8b0fc61739c6" + "032df14c30d297e2d80533db79b99b11";
    }

    @Test
    void keysAreDedicatedWhenStrongElseDerivedFromJwt() {
        properties.getJwt().setSecret("jwt-secret-jwt-secret-jwt-secret-0001");
        byte[] derivedMedia = SecretKeys.mediaSigningKey(properties);
        byte[] derivedTotp = SecretKeys.totpKey(properties);
        assertThat(derivedMedia).hasSize(32).isNotEqualTo(derivedTotp);
        assertThat(derivedMedia).isEqualTo(SecretKeys.hmacSha256(
                "jwt-secret-jwt-secret-jwt-secret-0001".getBytes(StandardCharsets.UTF_8),
                SecretKeys.MEDIA_LABEL.getBytes(StandardCharsets.UTF_8)));

        properties.getMedia().setSigningSecret("short");
        assertThat(SecretKeys.mediaSigningKey(properties)).isEqualTo(derivedMedia);
        properties.getMedia().setSigningSecret("dedicated-media-secret-0123456789abcdef");
        assertThat(new String(SecretKeys.mediaSigningKey(properties), StandardCharsets.UTF_8))
                .isEqualTo("dedicated-media-secret-012345678");
    }

    @Test
    void bootstrapDoesNothingWhenAnAdminExistsOrEmailIsTaken() {
        UserRepository users = mock(UserRepository.class);
        RoleRepository roles = mock(RoleRepository.class);
        DataInitializer initializer = new DataInitializer(users, roles, mock(PasswordEncoder.class), properties);

        when(users.countActiveByRoleCode(RoleCode.ADMINISTRATEUR)).thenReturn(1L);
        assertThat(initializer.bootstrap()).isEqualTo(DataInitializer.Outcome.ADMIN_EXISTS);

        when(users.countActiveByRoleCode(RoleCode.ADMINISTRATEUR)).thenReturn(0L);
        when(users.existsByEmailIgnoreCase("admin@zelqane.local")).thenReturn(true);
        assertThat(initializer.bootstrap()).isEqualTo(DataInitializer.Outcome.EMAIL_TAKEN);
        verify(users, never()).save(any());
    }

    @Test
    void bootstrapUsesConfiguredOrGeneratedPasswordAndFlag() {
        UserRepository users = mock(UserRepository.class);
        RoleRepository roles = mock(RoleRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenAnswer(inv -> "hash:" + inv.getArgument(0));
        when(roles.findByCode(RoleCode.ADMINISTRATEUR))
                .thenReturn(Optional.of(Role.builder().code(RoleCode.ADMINISTRATEUR).name("Admin").build()));
        DataInitializer initializer = new DataInitializer(users, roles, encoder, properties);

        properties.getSecurity().getBootstrapAdmin().setInitialPassword("Configure2026");
        properties.getSecurity().getBootstrapAdmin().setMustChangePassword(false);
        assertThat(initializer.bootstrap()).isEqualTo(DataInitializer.Outcome.CREATED_WITH_CONFIGURED_PASSWORD);
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getPasswordHash()).isEqualTo("hash:Configure2026");
        assertThat(saved.getValue().getMustChangePassword()).isFalse();
        assertThat(saved.getValue().getEmail()).isEqualTo("admin@zelqane.local");

        properties.getSecurity().getBootstrapAdmin().setInitialPassword("sanschiffre");
        assertThatThrownBy(initializer::bootstrap).isInstanceOf(IllegalStateException.class);

        properties.getSecurity().getBootstrapAdmin().setInitialPassword("");
        properties.getSecurity().getBootstrapAdmin().setMustChangePassword(true);
        assertThat(initializer.bootstrap()).isEqualTo(DataInitializer.Outcome.CREATED_WITH_GENERATED_PASSWORD);
    }

    @Test
    void generatedPasswordsFollowThePolicy() {
        for (int i = 0; i < 200; i++) {
            String password = DataInitializer.generatePassword();
            assertThat(password).hasSize(20).doesNotContainAnyWhitespaces();
            assertThat(password.chars().allMatch(c -> DataInitializer.PASSWORD_ALPHABET.indexOf(c) >= 0)).isTrue();
            assertThat(password).doesNotContain("0").doesNotContain("O").doesNotContain("1").doesNotContain("l")
                    .doesNotContain("I");
            assertThat(DataInitializer.isAcceptable(password)).isTrue();
        }
    }
}
