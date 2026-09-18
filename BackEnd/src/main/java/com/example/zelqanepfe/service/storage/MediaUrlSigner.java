package com.example.zelqanepfe.service.storage;

import com.example.zelqanepfe.security.SecretKeys;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Signed, expiring media URLs (docs/round2-contract.md §3.5). Pure: key, TTL and base URL are given, "now" is a
 * parameter.
 *
 * <pre>
 * url  = {base}/{encoded relativePath}?exp={exp}&amp;sig={sig}
 * exp  = ceil((now + ttl) / 300) × 300
 * sig  = base64url_nopad(HMAC-SHA256(key, "v1\n" + relativePath + "\n" + exp))
 * </pre>
 */
public final class MediaUrlSigner {

    public static final long BUCKET_SECONDS = 300;
    private static final String UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    /** Result of a signature check. */
    public enum Verdict {
        VALID,
        MISSING,
        INVALID,
        EXPIRED
    }

    private final byte[] key;
    private final long ttlSeconds;
    private final String baseUrl;

    public MediaUrlSigner(byte[] key, long ttlSeconds, String baseUrl) {
        this.key = key.clone();
        this.ttlSeconds = Math.max(60, ttlSeconds);
        String base = baseUrl == null || baseUrl.isBlank() ? "/uploads" : baseUrl.trim();
        this.baseUrl = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    public String baseUrl() {
        return baseUrl;
    }

    public long ttlSeconds() {
        return ttlSeconds;
    }

    /**
     * Normalised stored path: {@code '\'} → {@code '/'}, leading slashes removed, no empty, {@code .} or {@code ..}
     * segment, no NUL. Empty when the path is unusable.
     */
    public static Optional<String> normalise(String path) {
        if (path == null) {
            return Optional.empty();
        }
        String value = path.replace('\\', '/').replaceFirst("^/+", "");
        if (value.isEmpty() || value.indexOf('\0') >= 0 || value.endsWith("/")) {
            return Optional.empty();
        }
        for (String segment : value.split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                return Optional.empty();
            }
        }
        return Optional.of(value);
    }

    public long expiryFor(Instant now) {
        long target = now.getEpochSecond() + ttlSeconds;
        return Math.floorDiv(target + BUCKET_SECONDS - 1, BUCKET_SECONDS) * BUCKET_SECONDS;
    }

    /** Canonical unsigned URL {@code base/encodedPath}. */
    public String canonicalUrl(String relativePath) {
        String normalised = normalise(relativePath)
                .orElseThrow(() -> new IllegalArgumentException("Chemin de média invalide"));
        return baseUrl + "/" + encodePath(normalised);
    }

    public String sign(String relativePath, Instant now) {
        String normalised = normalise(relativePath)
                .orElseThrow(() -> new IllegalArgumentException("Chemin de média invalide"));
        long exp = expiryFor(now);
        return baseUrl + "/" + encodePath(normalised) + "?exp=" + exp + "&sig=" + signature(normalised, exp);
    }

    public String signature(String normalisedPath, long exp) {
        byte[] mac = SecretKeys.hmacSha256(key, ("v1\n" + normalisedPath + "\n" + exp).getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mac);
    }

    /** Checks {@code exp}/{@code sig} for an already normalised, decoded path. */
    public Verdict verify(String normalisedPath, String expRaw, String sig, Instant now) {
        if (expRaw == null || expRaw.isEmpty() || sig == null || sig.isEmpty()) {
            return Verdict.MISSING;
        }
        long exp;
        try {
            exp = Long.parseLong(expRaw);
        } catch (NumberFormatException ex) {
            return Verdict.INVALID;
        }
        long nowSeconds = now.getEpochSecond();
        if (exp > nowSeconds + ttlSeconds + BUCKET_SECONDS) {
            return Verdict.INVALID;
        }
        byte[] expected = signature(normalisedPath, exp).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, sig.getBytes(StandardCharsets.US_ASCII))) {
            return Verdict.INVALID;
        }
        return exp < nowSeconds ? Verdict.EXPIRED : Verdict.VALID;
    }

    /** Percent-encodes each segment (RFC 3986 unreserved characters kept), UTF-8. */
    public static String encodePath(String path) {
        StringBuilder out = new StringBuilder(path.length() + 16);
        for (byte b : path.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            if (c == '/' || (c < 128 && UNRESERVED.indexOf(c) >= 0)) {
                out.append(c);
            } else {
                out.append('%').append(Character.toUpperCase(Character.forDigit((b >> 4) & 0xF, 16)))
                        .append(Character.toUpperCase(Character.forDigit(b & 0xF, 16)));
            }
        }
        return out.toString();
    }

    /** Strict percent-decoding ({@code +} stays a plus); empty on a malformed escape or invalid UTF-8. */
    public static Optional<String> decodePath(String raw) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '%') {
                if (i + 2 >= raw.length()) {
                    return Optional.empty();
                }
                int hi = Character.digit(raw.charAt(i + 1), 16);
                int lo = Character.digit(raw.charAt(i + 2), 16);
                if (hi < 0 || lo < 0) {
                    return Optional.empty();
                }
                out.write((hi << 4) | lo);
                i += 2;
            } else if (c > 127) {
                byte[] bytes = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
                out.write(bytes, 0, bytes.length);
            } else {
                out.write(c);
            }
        }
        byte[] bytes = out.toByteArray();
        try {
            return Optional.of(StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString());
        } catch (java.nio.charset.CharacterCodingException ex) {
            return Optional.empty();
        }
    }
}
