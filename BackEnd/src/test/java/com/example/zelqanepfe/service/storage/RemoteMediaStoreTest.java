package com.example.zelqanepfe.service.storage;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/** FileStorageService + RemoteMediaStore against an in-memory stand-in of the zelqane-media Worker. */
class RemoteMediaStoreTest {

    private static final String TOKEN = "test-token";

    @TempDir
    Path uploads;

    private HttpServer server;
    private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
    private final List<String> calls = new CopyOnWriteArrayList<>();
    private FileStorageService storage;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getRawPath();
            String method = exchange.getRequestMethod();
            calls.add(method + " " + path);
            int status;
            byte[] body = new byte[0];
            if (!("Bearer " + TOKEN).equals(exchange.getRequestHeaders().getFirst("Authorization"))) {
                status = 401;
            } else if (path.startsWith("/o/")) {
                String key = java.net.URLDecoder.decode(path.substring(3), StandardCharsets.UTF_8);
                switch (method) {
                    case "PUT" -> {
                        objects.put(key, exchange.getRequestBody().readAllBytes());
                        status = 204;
                    }
                    case "GET" -> {
                        byte[] found = objects.get(key);
                        status = found == null ? 404 : 200;
                        body = found == null ? body : found;
                    }
                    default -> {
                        objects.remove(key);
                        status = 204;
                    }
                }
            } else if (path.startsWith("/prefix/") && "DELETE".equals(method)) {
                String prefix = java.net.URLDecoder.decode(path.substring(8), StandardCharsets.UTF_8);
                objects.keySet().removeIf(k -> k.startsWith(prefix));
                status = 200;
            } else {
                status = 404;
            }
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            if (body.length > 0) {
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.start();

        ZelqaneProperties properties = new ZelqaneProperties();
        properties.getMedia().setBaseUrl("/uploads");
        properties.getMedia().setUploadDir(uploads.toString());
        properties.getMedia().setRemoteUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/");
        properties.getMedia().setRemoteToken(TOKEN);
        storage = new FileStorageService(properties);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void storedFilesSurviveTheLossOfTheLocalDisk() throws IOException {
        byte[] content = "image bytes".getBytes(StandardCharsets.UTF_8);
        FileStorageService.StoredFile stored = storage.store(
                new MockMultipartFile("file", "a b.png", "image/png", content), "campaigns/7", "png");

        assertThat(objects).containsKey(stored.relativePath());

        Path local = uploads.resolve(stored.relativePath());
        Files.delete(local);
        Path restored = storage.resolve(stored.relativePath());

        assertThat(restored).isEqualTo(local);
        assertThat(Files.readAllBytes(restored)).isEqualTo(content);
    }

    @Test
    void copyAndDeleteAreMirrored() {
        FileStorageService.StoredFile stored = storage.store(
                new MockMultipartFile("file", "x.png", "image/png", new byte[] {1, 2, 3}), "campaigns/7", "png");
        String copy = storage.copy(stored.relativePath(), "campaigns/8");
        assertThat(objects).containsKeys(stored.relativePath(), copy);

        storage.delete(copy);
        assertThat(objects).doesNotContainKey(copy);

        storage.deleteDirectory("campaigns/7");
        assertThat(objects).isEmpty();
        assertThat(calls).contains("DELETE /prefix/campaigns/7/");
    }

    @Test
    void missingRemoteObjectLeavesTheFileAbsent() {
        Path path = storage.resolve("campaigns/9/none.png");
        assertThat(Files.exists(path)).isFalse();
    }

    @Test
    void keysAreEncodedPerSegment() {
        assertThat(RemoteMediaStore.encode("campaigns/7/a b+c.png")).isEqualTo("campaigns/7/a%20b%2Bc.png");
    }
}
