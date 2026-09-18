package com.example.zelqanepfe.security;

import com.example.zelqanepfe.config.ZelqaneProperties;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HexFormat;

/**
 * Key material of round 2 (docs/round2-contract.md §3.1). A dedicated secret of at least 32 UTF-8 bytes is used as
 * is (its first 32 bytes); otherwise the key is derived as {@code HMAC-SHA256(jwtSecret, label)}.
 */
public final class SecretKeys {

    public static final int MIN_SECRET_BYTES = 32;
    public static final String MEDIA_LABEL = "zelqane-media-signing-v1";
    public static final String TOTP_LABEL = "zelqane-totp-v1";

    private static final SecureRandom RANDOM = new SecureRandom();

    private SecretKeys() {
    }

    public static byte[] mediaSigningKey(ZelqaneProperties properties) {
        return key(properties.getMedia().getSigningSecret(), properties.getJwt().getSecret(), MEDIA_LABEL);
    }

    public static byte[] totpKey(ZelqaneProperties properties) {
        return key(properties.getSecurity().getTotp().getEncryptionKey(), properties.getJwt().getSecret(), TOTP_LABEL);
    }

    /** True when {@code dedicated} is long enough to be used without derivation. */
    public static boolean isStrong(String dedicated) {
        return dedicated != null && dedicated.getBytes(StandardCharsets.UTF_8).length >= MIN_SECRET_BYTES;
    }

    /**
     * The 32-byte key: the dedicated secret when strong, else derived from the JWT secret. Without any usable
     * secret (only possible when the startup validator did not run, e.g. hand-built unit tests), an ephemeral random
     * key keeps the process working without ever falling back to a constant.
     */
    static byte[] key(String dedicated, String jwtSecret, String label) {
        if (isStrong(dedicated)) {
            return Arrays.copyOf(dedicated.getBytes(StandardCharsets.UTF_8), MIN_SECRET_BYTES);
        }
        if (jwtSecret != null && !jwtSecret.isEmpty()) {
            return hmacSha256(jwtSecret.getBytes(StandardCharsets.UTF_8), label.getBytes(StandardCharsets.UTF_8));
        }
        byte[] random = new byte[MIN_SECRET_BYTES];
        RANDOM.nextBytes(random);
        return random;
    }

    public static byte[] hmacSha256(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 indisponible", ex);
        }
    }

    public static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("SHA-256 indisponible", ex);
        }
    }

    /** Constant-time comparison of two strings (UTF-8 bytes). */
    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }
}
