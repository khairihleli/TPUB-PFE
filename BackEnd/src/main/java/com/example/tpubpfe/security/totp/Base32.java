package com.example.tpubpfe.security.totp;

import java.io.ByteArrayOutputStream;
import java.util.Locale;

/** RFC 4648 Base32 (upper case, no padding on output; padding and spaces tolerated on input). */
public final class Base32 {

    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private Base32() {
    }

    public static String encode(byte[] data) {
        StringBuilder out = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                out.append(ALPHABET.charAt((buffer >> (bits - 5)) & 0x1F));
                bits -= 5;
            }
        }
        if (bits > 0) {
            out.append(ALPHABET.charAt((buffer << (5 - bits)) & 0x1F));
        }
        return out.toString();
    }

    /** @throws IllegalArgumentException on a character outside the alphabet */
    public static byte[] decode(String value) {
        String clean = value.replace("=", "").replace(" ", "").toUpperCase(Locale.ROOT);
        ByteArrayOutputStream out = new ByteArrayOutputStream(clean.length() * 5 / 8);
        int buffer = 0;
        int bits = 0;
        for (int i = 0; i < clean.length(); i++) {
            int index = ALPHABET.indexOf(clean.charAt(i));
            if (index < 0) {
                throw new IllegalArgumentException("Caractère Base32 invalide");
            }
            buffer = (buffer << 5) | index;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >> (bits - 8)) & 0xFF);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }
}
