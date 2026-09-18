package com.example.zelqanepfe.config;

import com.example.zelqanepfe.security.SecretKeys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Fails fast on a missing, short or compromised JWT secret (docs/round2-contract.md §3.1). Not active in the
 * {@code test} profile, which uses fixed test-only values.
 */
@Slf4j
@Component
@Profile("!test")
public class SecretsValidator implements InitializingBean {

    static final String MISSING_MESSAGE = "JWT_SECRET manquant ou trop court (32 octets minimum). "
            + "Définissez la variable d'environnement JWT_SECRET (voir .env.example).";
    static final String PLACEHOLDER_MESSAGE = "%s contient encore la valeur d'exemple de .env.example "
            + "(<…>) : générez une vraie valeur.";
    static final String COMPROMISED_MESSAGE =
            "JWT_SECRET compromis (valeur publiée dans l'historique git) : générez-en un nouveau.";

    /**
     * SHA-256 of the two values once committed to the repository (the application.yml placeholder and the value of
     * .env.example / start-local.ps1). Only the hashes are kept here.
     */
    static final Set<String> COMPROMISED_SHA256 = Set.of(
            "da47231a641a93a0dbd95bb5851e6d38f0103d79677a1a34e6d944fd2eb18b23",
            "e73c404dd4785474c4e9fdf1c6c630bef7951c30ad42b8c2e0d27ecadf7ddf7d");

    private final ZelqaneProperties properties;

    public SecretsValidator(ZelqaneProperties properties) {
        this.properties = properties;
    }

    @Override
    public void afterPropertiesSet() {
        validate(properties);
        if (!SecretKeys.isStrong(properties.getMedia().getSigningSecret())) {
            log.info("MEDIA_SIGNING_SECRET absent : clé de signature des médias dérivée de JWT_SECRET.");
        }
        if (!SecretKeys.isStrong(properties.getSecurity().getTotp().getEncryptionKey())) {
            log.info("TOTP_ENCRYPTION_KEY absent : clé de chiffrement TOTP dérivée de JWT_SECRET "
                    + "(changer JWT_SECRET obligera chaque utilisateur à réactiver la double authentification).");
        }
    }

    /** An unedited {@code <…>} placeholder copied from .env.example (publicly known, never a secret). */
    static boolean isPlaceholder(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim();
        return trimmed.startsWith("<") && trimmed.endsWith(">");
    }

    /** @throws IllegalStateException when the JWT secret or a dedicated key is unusable */
    static void validate(ZelqaneProperties properties) {
        String secret = properties.getJwt() == null ? null : properties.getJwt().getSecret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < SecretKeys.MIN_SECRET_BYTES) {
            throw new IllegalStateException(MISSING_MESSAGE);
        }
        if (isPlaceholder(secret)) {
            throw new IllegalStateException(PLACEHOLDER_MESSAGE.formatted("JWT_SECRET"));
        }
        if (COMPROMISED_SHA256.contains(SecretKeys.sha256Hex(secret))) {
            throw new IllegalStateException(COMPROMISED_MESSAGE);
        }
        if (isPlaceholder(properties.getMedia().getSigningSecret())) {
            throw new IllegalStateException(PLACEHOLDER_MESSAGE.formatted("MEDIA_SIGNING_SECRET"));
        }
        if (isPlaceholder(properties.getSecurity().getTotp().getEncryptionKey())) {
            throw new IllegalStateException(PLACEHOLDER_MESSAGE.formatted("TOTP_ENCRYPTION_KEY"));
        }
    }
}
