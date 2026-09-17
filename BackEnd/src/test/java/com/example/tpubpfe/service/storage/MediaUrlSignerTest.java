package com.example.tpubpfe.service.storage;

import com.example.tpubpfe.config.TpubProperties;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class MediaUrlSignerTest {

    private static final byte[] KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);
    private static final Instant NOW = Instant.ofEpochSecond(1_800_000_123L);

    private final MediaUrlSigner signer = new MediaUrlSigner(KEY, 3600, "/uploads/");

    @Test
    void expiryIsRoundedUpToFiveMinuteBuckets() {
        assertThat(signer.expiryFor(NOW)).isEqualTo(1_800_003_900L);
        assertThat(signer.expiryFor(Instant.ofEpochSecond(1_799_996_400L))).isEqualTo(1_800_000_000L);
        assertThat(signer.expiryFor(NOW) % 300).isZero();
    }

    @Test
    void signedUrlVerifiesAndIsStableWithinABucket() {
        String url = signer.sign("campaigns/12/a b.png", NOW);
        assertThat(url).startsWith("/uploads/campaigns/12/a%20b.png?exp=1800003900&sig=");
        assertThat(signer.sign("\\campaigns\\12\\a b.png", NOW.plusSeconds(60))).isEqualTo(url);

        String sig = url.substring(url.indexOf("&sig=") + 5);
        assertThat(sig).doesNotContain("=").doesNotContain("+").doesNotContain("/");
        assertThat(signer.verify("campaigns/12/a b.png", "1800003900", sig, NOW)).isEqualTo(MediaUrlSigner.Verdict.VALID);
    }

    @Test
    void verificationRejectsTamperingMissingFarFutureAndExpired() {
        long exp = signer.expiryFor(NOW);
        String sig = signer.signature("campaigns/1/x.png", exp);

        assertThat(signer.verify("campaigns/1/x.png", null, sig, NOW)).isEqualTo(MediaUrlSigner.Verdict.MISSING);
        assertThat(signer.verify("campaigns/1/x.png", String.valueOf(exp), "", NOW)).isEqualTo(MediaUrlSigner.Verdict.MISSING);
        assertThat(signer.verify("campaigns/1/y.png", String.valueOf(exp), sig, NOW)).isEqualTo(MediaUrlSigner.Verdict.INVALID);
        assertThat(signer.verify("campaigns/1/x.png", "abc", sig, NOW)).isEqualTo(MediaUrlSigner.Verdict.INVALID);
        assertThat(signer.verify("campaigns/1/x.png", String.valueOf(exp + 300), sig, NOW))
                .isEqualTo(MediaUrlSigner.Verdict.INVALID);

        long farFuture = NOW.getEpochSecond() + 3600 + 600;
        assertThat(signer.verify("campaigns/1/x.png", String.valueOf(farFuture),
                signer.signature("campaigns/1/x.png", farFuture), NOW)).isEqualTo(MediaUrlSigner.Verdict.INVALID);

        assertThat(signer.verify("campaigns/1/x.png", String.valueOf(exp), sig, Instant.ofEpochSecond(exp + 1)))
                .isEqualTo(MediaUrlSigner.Verdict.EXPIRED);
        assertThat(new MediaUrlSigner("another-key-another-key-another!".getBytes(StandardCharsets.UTF_8), 3600, "/uploads")
                .verify("campaigns/1/x.png", String.valueOf(exp), sig, NOW)).isEqualTo(MediaUrlSigner.Verdict.INVALID);
    }

    @Test
    void normaliseRefusesTraversalAndEmptySegments() {
        assertThat(MediaUrlSigner.normalise("/campaigns/1/x.png")).contains("campaigns/1/x.png");
        assertThat(MediaUrlSigner.normalise("campaigns\\1\\x.png")).contains("campaigns/1/x.png");
        assertThat(MediaUrlSigner.normalise("campaigns/../secrets.txt")).isEmpty();
        assertThat(MediaUrlSigner.normalise("campaigns/./x.png")).isEmpty();
        assertThat(MediaUrlSigner.normalise("campaigns//x.png")).isEmpty();
        assertThat(MediaUrlSigner.normalise("campaigns/x\0.png")).isEmpty();
        assertThat(MediaUrlSigner.normalise("")).isEmpty();
    }

    @Test
    void percentEncodingRoundTrips() {
        String encoded = MediaUrlSigner.encodePath("logos/9/café é+1.png");
        assertThat(encoded).isEqualTo("logos/9/caf%C3%A9%20%C3%A9%2B1.png");
        assertThat(MediaUrlSigner.decodePath(encoded)).contains("logos/9/café é+1.png");
        assertThat(MediaUrlSigner.decodePath("a%2")).isEmpty();
        assertThat(MediaUrlSigner.decodePath("a%ZZ")).isEmpty();
        assertThat(MediaUrlSigner.decodePath("%C3%28")).as("invalid UTF-8").isEmpty();
    }

    @Test
    void storagePublicUrlCanonicalAndResign() {
        TpubProperties properties = new TpubProperties();
        properties.getMedia().setBaseUrl("/uploads");
        properties.getMedia().setSigningSecret("a-dedicated-signing-secret-of-32-bytes!");
        FileStorageService storage = new FileStorageService(properties, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(storage.publicUrl(null)).isNull();
        assertThat(storage.publicUrl("  ")).isEqualTo("/uploads");
        assertThat(storage.publicUrl("https://cdn.example.org/x.png")).isEqualTo("https://cdn.example.org/x.png");
        assertThat(storage.publicUrl("campaigns/1/x.png")).startsWith("/uploads/campaigns/1/x.png?exp=1800003900&sig=");
        assertThat(storage.publicUrl("campaigns/../x.png")).isNull();

        String canonical = storage.canonicalUrl("campaigns/1/x.png");
        assertThat(canonical).isEqualTo("/uploads/campaigns/1/x.png");
        assertThat(storage.resignStoredUrl(canonical)).isEqualTo(storage.publicUrl("campaigns/1/x.png"));
        assertThat(storage.resignStoredUrl(canonical + "?exp=1&sig=old")).isEqualTo(storage.publicUrl("campaigns/1/x.png"));
        assertThat(storage.resignStoredUrl("/static/default.png")).isEqualTo("/static/default.png");
        assertThat(storage.resignStoredUrl(null)).isNull();
        assertThat(Optional.ofNullable(storage.resignStoredUrl("https://x/y.png"))).contains("https://x/y.png");
    }
}
