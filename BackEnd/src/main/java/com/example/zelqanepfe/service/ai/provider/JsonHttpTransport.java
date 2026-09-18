package com.example.zelqanepfe.service.ai.provider;

import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider.ProviderException;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/** JSON POST used by the providers; abstracted so tests never reach the network. */
@FunctionalInterface
public interface JsonHttpTransport {

    Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    record Response(int status, String body) {

        public boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /** @throws ProviderException on a transport failure (connection, timeout) */
    Response post(String url, Map<String, String> headers, String jsonBody);

    /** Spring {@link RestClient} with a 5 s connect timeout and the given read timeout. No retry. */
    static JsonHttpTransport restClient(Duration readTimeout) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(readTimeout);
        RestClient client = RestClient.builder().requestFactory(factory).build();
        return (url, headers, jsonBody) -> {
            try {
                return client.post()
                        .uri(url)
                        .contentType(MediaType.APPLICATION_JSON)
                        .headers(h -> headers.forEach(h::set))
                        .body(jsonBody)
                        .exchange((request, response) -> new Response(response.getStatusCode().value(),
                                new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
            } catch (RuntimeException ex) {
                Throwable cause = ex.getCause() instanceof IOException io ? io : ex;
                throw new ProviderException("transport : " + cause.getClass().getSimpleName(), ex);
            }
        };
    }
}
