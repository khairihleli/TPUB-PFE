package com.example.zelqanepfe.service.storage;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;

/**
 * Durable copy of the uploads in Cloudflare R2, reached through the zelqane-media Worker (deploy/media-store):
 * {@code PUT/GET/DELETE <url>/o/<key>} and {@code DELETE <url>/prefix/<prefix>}, authenticated by a bearer token.
 * Every call is best effort: a failure is logged and never breaks the local operation.
 */
@Slf4j
public class RemoteMediaStore {

    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private final String baseUrl;
    private final String token;
    private final HttpClient http;

    public RemoteMediaStore(String baseUrl, String token) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.token = token;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** Null when the remote store is not configured. */
    public static RemoteMediaStore fromConfig(String url, String token) {
        if (url == null || url.isBlank() || token == null || token.isBlank()) {
            return null;
        }
        return new RemoteMediaStore(url.trim(), token.trim());
    }

    public void put(String key, Path file) {
        try {
            HttpResponse<Void> res = http.send(request("/o/" + encode(key))
                    .PUT(HttpRequest.BodyPublishers.ofFile(file)).build(), HttpResponse.BodyHandlers.discarding());
            if (res.statusCode() / 100 != 2) {
                log.warn("R2 : envoi de {} refusé ({})", key, res.statusCode());
            }
        } catch (IOException ex) {
            log.warn("R2 : envoi de {} impossible : {}", key, ex.getMessage());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    /** Downloads {@code key} into {@code target}; false when the object does not exist or cannot be read. */
    public boolean fetch(String key, Path target) {
        Path temp = null;
        try {
            Files.createDirectories(target.getParent());
            temp = Files.createTempFile(target.getParent(), "r2-", ".tmp");
            HttpResponse<Path> res = http.send(request("/o/" + encode(key)).GET().build(),
                    HttpResponse.BodyHandlers.ofFile(temp));
            if (res.statusCode() != 200) {
                return false;
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            temp = null;
            return true;
        } catch (IOException ex) {
            log.warn("R2 : lecture de {} impossible : {}", key, ex.getMessage());
            return false;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return false;
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // temporary file only
                }
            }
        }
    }

    public void delete(String key) {
        send(request("/o/" + encode(key)).DELETE().build(), key);
    }

    public void deletePrefix(String prefix) {
        String normalised = prefix.endsWith("/") ? prefix : prefix + "/";
        send(request("/prefix/" + encode(normalised)).DELETE().build(), normalised);
    }

    private void send(HttpRequest request, String key) {
        try {
            HttpResponse<Void> res = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (res.statusCode() / 100 != 2 && res.statusCode() != 404) {
                log.warn("R2 : suppression de {} refusée ({})", key, res.statusCode());
            }
        } catch (IOException ex) {
            log.warn("R2 : suppression de {} impossible : {}", key, ex.getMessage());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token);
    }

    /** Encodes each segment, keeps the slashes. */
    static String encode(String key) {
        String[] parts = key.replace('\\', '/').split("/", -1);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                out.append('/');
            }
            out.append(URLEncoder.encode(parts[i], StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return out.toString();
    }
}
