package com.example.zelqanepfe.service.storage;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.security.SecretKeys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Local file storage under {@code zelqane.media.upload-dir}. Every path is normalised and must stay inside the root.
 * When {@code zelqane.media.remote-url} is set, every write is copied to Cloudflare R2 ({@link RemoteMediaStore}) and a
 * file missing locally (ephemeral disk after a restart) is downloaded again on first read.
 */
@Slf4j
@Service
public class FileStorageService {

    public record StoredFile(String relativePath, long sizeBytes, String sha256) {
    }

    private final ZelqaneProperties properties;
    private final Clock clock;
    private final MediaUrlSigner signer;
    private final RemoteMediaStore remote;

    /** Hand-built instances (unit tests): system clock, keys from the given properties. */
    public FileStorageService(ZelqaneProperties properties) {
        this(properties, Clock.systemUTC());
    }

    @Autowired
    public FileStorageService(ZelqaneProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        this.signer = new MediaUrlSigner(SecretKeys.mediaSigningKey(properties),
                properties.getMedia().getSignedUrlTtlSeconds(), properties.getMedia().getBaseUrl());
        this.remote = RemoteMediaStore.fromConfig(properties.getMedia().getRemoteUrl(),
                properties.getMedia().getRemoteToken());
    }

    public MediaUrlSigner signer() {
        return signer;
    }

    public StoredFile store(MultipartFile file, String directory, String extension) {
        String fileName = UUID.randomUUID() + "." + extension;
        String relativePath = joinRelative(directory, fileName);
        Path target = localPath(relativePath);
        try {
            Files.createDirectories(target.getParent());
            MessageDigest digest = sha256();
            try (InputStream in = new DigestInputStream(file.getInputStream(), digest)) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            publish(relativePath);
            return new StoredFile(relativePath, Files.size(target), HexFormat.of().formatHex(digest.digest()));
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to store file " + relativePath, ex);
        }
    }

    /** Local path of a stored file; downloaded from R2 first when it is missing locally. */
    public Path resolve(String relativePath) {
        Path path = localPath(relativePath);
        if (remote != null && !Files.exists(path) && !path.equals(root())) {
            remote.fetch(key(path), path);
        }
        return path;
    }

    /** Copies a file written directly under the root (e.g. thumbnails) to R2. */
    public void publish(String relativePath) {
        if (remote != null) {
            Path path = localPath(relativePath);
            if (Files.isRegularFile(path)) {
                remote.put(key(path), path);
            }
        }
    }

    private String key(Path path) {
        return root().relativize(path).toString().replace('\\', '/');
    }

    private Path localPath(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw invalidPath();
        }
        Path root = root();
        Path resolved = root.resolve(relativePath.replace('\\', '/').replaceFirst("^/+", "")).normalize();
        if (!resolved.startsWith(root)) {
            throw invalidPath();
        }
        return resolved;
    }

    /**
     * URL of a stored file for an authorised viewer (docs/round2-contract.md §1.2, §3.5): null → null; blank → the
     * unsigned base URL; an absolute {@code http(s)://} value unchanged; any other path → a signed, expiring URL.
     */
    public String publicUrl(String relativePath) {
        if (relativePath == null) {
            return null;
        }
        if (relativePath.isBlank()) {
            return signer.baseUrl();
        }
        if (isAbsoluteUrl(relativePath)) {
            return relativePath;
        }
        return MediaUrlSigner.normalise(relativePath)
                .map(path -> signer.sign(path, clock.instant()))
                .orElse(null);
    }

    /** Canonical unsigned {@code base/relativePath}, the only form stored in the database (e.g. diffusion logs). */
    public String canonicalUrl(String relativePath) {
        if (relativePath == null) {
            return null;
        }
        if (relativePath.isBlank()) {
            return signer.baseUrl();
        }
        if (isAbsoluteUrl(relativePath)) {
            return relativePath;
        }
        return MediaUrlSigner.normalise(relativePath)
                .map(signer::canonicalUrl)
                .orElse(null);
    }

    /**
     * Re-signs a stored canonical URL ({@code base/encodedPath}, query ignored). Other values (external URLs, legacy
     * data) are returned unchanged.
     */
    public String resignStoredUrl(String storedUrl) {
        if (storedUrl == null || storedUrl.isBlank() || isAbsoluteUrl(storedUrl)) {
            return storedUrl;
        }
        String prefix = signer.baseUrl() + "/";
        if (!storedUrl.startsWith(prefix)) {
            return storedUrl;
        }
        int query = storedUrl.indexOf('?');
        String encoded = storedUrl.substring(prefix.length(), query >= 0 ? query : storedUrl.length());
        return MediaUrlSigner.decodePath(encoded)
                .flatMap(MediaUrlSigner::normalise)
                .map(path -> signer.sign(path, clock.instant()))
                .orElse(storedUrl);
    }

    /** True when the normalised path resolves inside the upload root. */
    public boolean isInsideRoot(String normalisedPath) {
        Path root = root();
        return root.resolve(normalisedPath).normalize().startsWith(root);
    }

    private static boolean isAbsoluteUrl(String value) {
        String lower = value.trim().toLowerCase(java.util.Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    public void delete(String relativePath) {
        try {
            Path path = localPath(relativePath);
            Files.deleteIfExists(path);
            if (remote != null) {
                remote.delete(key(path));
            }
        } catch (IOException ex) {
            log.warn("Unable to delete {}: {}", relativePath, ex.getMessage());
        }
    }

    public void deleteDirectory(String relativeDir) {
        Path dir = localPath(relativeDir);
        if (dir.equals(root())) {
            return;
        }
        if (remote != null) {
            remote.deletePrefix(key(dir));
        }
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    log.warn("Unable to delete {}: {}", path, ex.getMessage());
                }
            });
        } catch (IOException ex) {
            log.warn("Unable to delete directory {}: {}", relativeDir, ex.getMessage());
        }
    }

    public String copy(String relativePath, String targetDirectory) {
        Path source = resolve(relativePath);
        String name = source.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String extension = dot >= 0 ? name.substring(dot + 1) : "bin";
        String targetRelative = joinRelative(targetDirectory, UUID.randomUUID() + "." + extension);
        Path target = localPath(targetRelative);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            publish(targetRelative);
            return targetRelative;
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to copy " + relativePath, ex);
        }
    }

    public static Optional<String> sniffMime(byte[] head) {
        if (head == null) {
            return Optional.empty();
        }
        if (startsWith(head, 0, 0xFF, 0xD8, 0xFF)) {
            return Optional.of("image/jpeg");
        }
        if (startsWith(head, 0, 0x89, 0x50, 0x4E, 0x47)) {
            return Optional.of("image/png");
        }
        if (startsWith(head, 0, 0x47, 0x49, 0x46, 0x38)) {
            return Optional.of("image/gif");
        }
        if (startsWith(head, 0, 'R', 'I', 'F', 'F') && startsWith(head, 8, 'W', 'E', 'B', 'P')) {
            return Optional.of("image/webp");
        }
        if (startsWith(head, 4, 'f', 't', 'y', 'p')) {
            return Optional.of("video/mp4");
        }
        if (startsWith(head, 0, 0x1A, 0x45, 0xDF, 0xA3)) {
            return Optional.of("video/webm");
        }
        return Optional.empty();
    }

    private static boolean startsWith(byte[] data, int offset, int... expected) {
        if (data.length < offset + expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((data[offset + i] & 0xFF) != (expected[i] & 0xFF)) {
                return false;
            }
        }
        return true;
    }

    private Path root() {
        String dir = properties.getMedia().getUploadDir() == null ? "./uploads" : properties.getMedia().getUploadDir();
        return Paths.get(dir).toAbsolutePath().normalize();
    }

    private static String joinRelative(String directory, String fileName) {
        if (directory == null || directory.isBlank()) {
            return fileName;
        }
        String dir = directory.replace('\\', '/');
        return (dir.endsWith("/") ? dir : dir + "/") + fileName;
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static ApiException invalidPath() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "Chemin de fichier invalide.");
    }
}
