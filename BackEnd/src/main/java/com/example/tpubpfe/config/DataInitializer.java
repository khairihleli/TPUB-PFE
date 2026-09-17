package com.example.tpubpfe.config;

import com.example.tpubpfe.dto.PasswordChangeRequest;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Bootstrap administrator (docs/round2-contract.md §3.2). Nothing is created when an active administrator exists
 * or when the bootstrap e-mail is already taken. The password comes from {@code TPUB_ADMIN_INITIAL_PASSWORD};
 * otherwise a random one is generated and logged once. No password literal lives in the code.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    /** Alphabet of generated passwords: {@code A-Za-z0-9} without the ambiguous {@code 0 O 1 l I}. */
    static final String PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    static final int GENERATED_LENGTH = 20;
    private static final Pattern STRENGTH = Pattern.compile(PasswordChangeRequest.STRENGTH_PATTERN);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final TpubProperties properties;

    /** What the bootstrap did (for tests and logs). */
    enum Outcome {
        ADMIN_EXISTS,
        EMAIL_TAKEN,
        ROLE_MISSING,
        CREATED_WITH_CONFIGURED_PASSWORD,
        CREATED_WITH_GENERATED_PASSWORD
    }

    @Override
    public void run(String... args) {
        bootstrap();
    }

    Outcome bootstrap() {
        if (userRepository.countActiveByRoleCode(RoleCode.ADMINISTRATEUR) > 0) {
            return Outcome.ADMIN_EXISTS;
        }
        TpubProperties.BootstrapAdmin config = properties.getSecurity().getBootstrapAdmin();
        String email = config.getEmail() == null || config.getEmail().isBlank()
                ? "admin@tpub.local" : config.getEmail().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmailIgnoreCase(email)) {
            log.warn("Aucun administrateur actif, et le compte « {} » existe déjà : aucun administrateur créé.", email);
            return Outcome.EMAIL_TAKEN;
        }
        Optional<Role> role = roleRepository.findByCode(RoleCode.ADMINISTRATEUR);
        if (role.isEmpty()) {
            log.warn("Rôle ADMINISTRATEUR absent : administrateur initial non créé.");
            return Outcome.ROLE_MISSING;
        }
        String configured = config.getInitialPassword();
        boolean generated = configured == null || configured.isEmpty();
        String password;
        if (generated) {
            password = generatePassword();
        } else {
            if (!isAcceptable(configured)) {
                throw new IllegalStateException("TPUB_ADMIN_INITIAL_PASSWORD invalide : 8 à 100 caractères, "
                        + "au moins une lettre et un chiffre.");
            }
            password = configured;
        }
        userRepository.save(User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .role(role.get())
                .nom("Administrateur TPUB")
                .societe("Tukhnanutha")
                .isActive(true)
                .mustChangePassword(config.isMustChangePassword())
                .build());
        if (generated) {
            log.warn("""

                    ==================================================================
                      Administrateur initial créé : {}
                      Mot de passe administrateur initial (à changer) : {}
                      Ce mot de passe n'est affiché qu'une seule fois.
                    ==================================================================""", email, password);
            return Outcome.CREATED_WITH_GENERATED_PASSWORD;
        }
        log.info("Administrateur initial créé : {} (mot de passe fourni par TPUB_ADMIN_INITIAL_PASSWORD).", email);
        return Outcome.CREATED_WITH_CONFIGURED_PASSWORD;
    }

    /** Same policy as the account forms: 8..100 characters, at least one letter and one digit. */
    static boolean isAcceptable(String password) {
        return password != null && password.length() >= 8 && password.length() <= 100
                && STRENGTH.matcher(password).matches();
    }

    /** 20 characters from {@link #PASSWORD_ALPHABET}, with at least one digit and one letter. */
    static String generatePassword() {
        while (true) {
            StringBuilder password = new StringBuilder(GENERATED_LENGTH);
            for (int i = 0; i < GENERATED_LENGTH; i++) {
                password.append(PASSWORD_ALPHABET.charAt(RANDOM.nextInt(PASSWORD_ALPHABET.length())));
            }
            String value = password.toString();
            if (value.chars().anyMatch(Character::isDigit) && value.chars().anyMatch(Character::isLetter)) {
                return value;
            }
        }
    }
}
