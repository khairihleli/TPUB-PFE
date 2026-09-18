package com.example.zelqanepfe.security.totp;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/** AES-256-GCM of TOTP secrets: {@code base64(IV(12) ‖ ciphertext ‖ tag(128 bits))}. */
public final class TotpCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public TotpCipher(byte[] key) {
        if (key == null || key.length < 32) {
            throw new IllegalArgumentException("Clé AES-256 de 32 octets attendue");
        }
        this.key = new SecretKeySpec(Arrays.copyOf(key, 32), "AES");
    }

    public String encrypt(String plain) {
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Chiffrement AES-GCM impossible", ex);
        }
    }

    /** @throws IllegalStateException when the value was not produced with this key (e.g. JWT secret rotated) */
    public String decrypt(String stored) {
        try {
            byte[] raw = Base64.getDecoder().decode(stored);
            if (raw.length <= IV_BYTES) {
                throw new IllegalStateException("Secret TOTP chiffré invalide");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, raw, 0, IV_BYTES));
            return new String(cipher.doFinal(raw, IV_BYTES, raw.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            throw new IllegalStateException("Secret TOTP illisible avec la clé actuelle", ex);
        }
    }
}
