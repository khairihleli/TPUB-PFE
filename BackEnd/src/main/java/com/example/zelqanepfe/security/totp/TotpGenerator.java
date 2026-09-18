package com.example.zelqanepfe.security.totp;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.OptionalLong;

/**
 * TOTP (RFC 6238 over RFC 4226 HOTP): HMAC-SHA1, 6 digits, 30-second step, T0 = 0, validation window −1..+1 step,
 * replay protection through the last accepted step.
 */
public final class TotpGenerator {

    public static final int DIGITS = 6;
    public static final long STEP_SECONDS = 30;
    public static final int SECRET_BYTES = 20;
    private static final int MODULUS = 1_000_000;

    private TotpGenerator() {
    }

    public static long step(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), STEP_SECONDS);
    }

    /** HOTP value of {@code counter}, zero-padded to 6 digits. */
    public static String code(byte[] secret, long counter) {
        byte[] hash;
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA1 indisponible", ex);
        }
        int offset = hash[hash.length - 1] & 0x0F;
        int binary = ((hash[offset] & 0x7F) << 24)
                | ((hash[offset + 1] & 0xFF) << 16)
                | ((hash[offset + 2] & 0xFF) << 8)
                | (hash[offset + 3] & 0xFF);
        return String.format("%06d", binary % MODULUS);
    }

    public static String codeAt(byte[] secret, Instant instant) {
        return code(secret, step(instant));
    }

    /** True for exactly six ASCII digits. */
    public static boolean isCodeFormat(String code) {
        return code != null && code.length() == DIGITS && code.chars().allMatch(c -> c >= '0' && c <= '9');
    }

    /**
     * The matched step when {@code code} is valid at {@code now} (steps −1, 0, +1) and newer than
     * {@code lastUsedStep}; empty otherwise.
     */
    public static OptionalLong verify(byte[] secret, String code, Instant now, Long lastUsedStep) {
        if (!isCodeFormat(code)) {
            return OptionalLong.empty();
        }
        long current = step(now);
        byte[] expected = code.getBytes(StandardCharsets.US_ASCII);
        for (long candidate = current - 1; candidate <= current + 1; candidate++) {
            if (lastUsedStep != null && candidate <= lastUsedStep) {
                continue;
            }
            if (MessageDigest.isEqual(code(secret, candidate).getBytes(StandardCharsets.US_ASCII), expected)) {
                return OptionalLong.of(candidate);
            }
        }
        return OptionalLong.empty();
    }

    /** {@code otpauth://totp/{issuer}:{email}?secret=…&issuer=…&algorithm=SHA1&digits=6&period=30}. */
    public static String otpauthUri(String issuer, String email, String base32Secret) {
        String encodedIssuer = encode(issuer);
        return "otpauth://totp/" + encodedIssuer + ":" + encode(email)
                + "?secret=" + base32Secret
                + "&issuer=" + encodedIssuer
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
