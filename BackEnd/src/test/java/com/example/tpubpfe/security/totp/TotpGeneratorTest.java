package com.example.tpubpfe.security.totp;

import com.example.tpubpfe.model.RoleCode;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.OptionalLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TotpGeneratorTest {

    /** RFC 6238 appendix B, SHA1 seed "12345678901234567890". */
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @Test
    void rfc6238Sha1VectorsTruncatedToSixDigits() {
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(59L))).isEqualTo("287082");
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(1111111109L))).isEqualTo("081804");
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(1111111111L))).isEqualTo("050471");
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(1234567890L))).isEqualTo("005924");
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(2000000000L))).isEqualTo("279037");
        assertThat(TotpGenerator.codeAt(RFC_SECRET, Instant.ofEpochSecond(20000000000L))).isEqualTo("353130");
    }

    @Test
    void verifyAcceptsAdjacentStepsOnlyAndRefusesReplay() {
        Instant now = Instant.ofEpochSecond(1234567890L);
        long step = TotpGenerator.step(now);
        String previous = TotpGenerator.code(RFC_SECRET, step - 1);
        String next = TotpGenerator.code(RFC_SECRET, step + 1);
        String tooOld = TotpGenerator.code(RFC_SECRET, step - 2);

        assertThat(TotpGenerator.verify(RFC_SECRET, previous, now, null)).isEqualTo(OptionalLong.of(step - 1));
        assertThat(TotpGenerator.verify(RFC_SECRET, next, now, null)).isEqualTo(OptionalLong.of(step + 1));
        assertThat(TotpGenerator.verify(RFC_SECRET, tooOld, now, null)).isEmpty();
        assertThat(TotpGenerator.verify(RFC_SECRET, "005924", now, step)).as("replay of the same step").isEmpty();
        assertThat(TotpGenerator.verify(RFC_SECRET, next, now, step)).isEqualTo(OptionalLong.of(step + 1));
        assertThat(TotpGenerator.verify(RFC_SECRET, "12345", now, null)).isEmpty();
        assertThat(TotpGenerator.verify(RFC_SECRET, "abcdef", now, null)).isEmpty();
    }

    @Test
    void base32RoundTripsAndMatchesRfc4648() {
        assertThat(Base32.encode("foobar".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTBOI");
        assertThat(Base32.encode("12345678901234567890".getBytes(StandardCharsets.US_ASCII)))
                .isEqualTo("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        assertThat(Base32.decode("mzxw6ytboi======")).isEqualTo("foobar".getBytes(StandardCharsets.US_ASCII));
        assertThatThrownBy(() -> Base32.decode("MZ1!")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void otpauthUriEncodesTheAccount() {
        assertThat(TotpGenerator.otpauthUri("TPUB", "ops+1@tpub.tn", "ABCDEF"))
                .isEqualTo("otpauth://totp/TPUB:ops%2B1%40tpub.tn?secret=ABCDEF&issuer=TPUB&algorithm=SHA1&digits=6&period=30");
    }

    @Test
    void cipherRoundTripsWithRandomIvAndRejectsAnotherKey() {
        byte[] key = new byte[32];
        key[0] = 7;
        TotpCipher cipher = new TotpCipher(key);
        String a = cipher.encrypt("JBSWY3DPEHPK3PXP");
        String b = cipher.encrypt("JBSWY3DPEHPK3PXP");
        assertThat(a).isNotEqualTo(b);
        assertThat(cipher.decrypt(a)).isEqualTo("JBSWY3DPEHPK3PXP");

        byte[] other = new byte[32];
        assertThatThrownBy(() -> new TotpCipher(other).decrypt(a)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new TotpCipher(new byte[16])).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recoveryCodesFormatNormalisationAndHash() {
        List<String> codes = RecoveryCodes.generate();
        assertThat(codes).hasSize(10).allMatch(c -> c.matches("^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$"));
        assertThat(new HashSet<>(codes)).hasSize(10);
        assertThat(RecoveryCodes.isRecoveryFormat(" ABCDE-FGHJK ")).isTrue();
        assertThat(RecoveryCodes.isRecoveryFormat("abcdefghjk")).isTrue();
        assertThat(RecoveryCodes.isRecoveryFormat("abcde-fghij")).as("i is excluded").isFalse();
        assertThat(RecoveryCodes.isRecoveryFormat("123456")).isFalse();

        byte[] key = new byte[32];
        String hash = RecoveryCodes.hash(key, 42L, "ABCDE-FGHJK");
        assertThat(hash).hasSize(64).isEqualTo(RecoveryCodes.hash(key, 42L, "abcdefghjk"));
        assertThat(hash).isNotEqualTo(RecoveryCodes.hash(key, 43L, "abcdefghjk"));
    }

    @Test
    void policyIgnoresAnnonceurAndUnknownRoles() {
        TotpPolicy policy = TotpPolicy.of(List.of("administrateur, SUPERVISEUR", "ANNONCEUR", "PIRATE", ""));
        assertThat(policy.requiredRoles()).containsExactlyInAnyOrder(RoleCode.ADMINISTRATEUR, RoleCode.SUPERVISEUR);
        assertThat(policy.isRequired("OPERATEUR")).isFalse();
        assertThat(policy.isRequired("ANNONCEUR")).isFalse();
        assertThat(TotpPolicy.of(List.of()).requiredRoles()).isEmpty();
    }
}
