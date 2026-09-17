package com.example.tpubpfe.security.totp;

import com.example.tpubpfe.security.SecretKeys;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Recovery codes {@code xxxxx-xxxxx}: lower-case Crockford Base32 without {@code i l o u}, 50 random bits, stored as
 * {@code hex(HMAC-SHA256(totpKey, userId + ":" + normalized))}.
 */
public final class RecoveryCodes {

    public static final int COUNT = 10;
    static final String ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
    private static final Pattern FORMAT = Pattern.compile("^[0-9a-hjkmnp-tv-z]{5}-?[0-9a-hjkmnp-tv-z]{5}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private RecoveryCodes() {
    }

    public static List<String> generate() {
        List<String> codes = new ArrayList<>(COUNT);
        for (int i = 0; i < COUNT; i++) {
            StringBuilder code = new StringBuilder(11);
            for (int c = 0; c < 10; c++) {
                if (c == 5) {
                    code.append('-');
                }
                code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            codes.add(code.toString());
        }
        return codes;
    }

    /** Lower case, surrounding spaces and hyphen removed. */
    public static String normalize(String code) {
        return code == null ? "" : code.trim().toLowerCase(Locale.ROOT).replace("-", "");
    }

    /** {@code xxxxx-xxxxx} (hyphen optional, case-insensitive). */
    public static boolean isRecoveryFormat(String code) {
        return code != null && FORMAT.matcher(code.trim().toLowerCase(Locale.ROOT)).matches();
    }

    public static String hash(byte[] totpKey, Long userId, String code) {
        byte[] mac = SecretKeys.hmacSha256(totpKey,
                (userId + ":" + normalize(code)).getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(mac);
    }
}
