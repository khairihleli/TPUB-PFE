package com.example.zelqanepfe.security;

import com.example.zelqanepfe.exception.ApiErrorBody;
import com.example.zelqanepfe.service.storage.FileStorageService;
import com.example.zelqanepfe.service.storage.MediaUrlSigner;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Optional;

/**
 * Guards {@code /uploads/**} with signed, expiring URLs (docs/round2-contract.md §3.5):
 * traversal → 404 without body; {@code exp}/{@code sig} missing → 403 {@code MEDIA_SIGNATURE_REQUIRED}; malformed,
 * too far in the future or wrong signature → 403 {@code MEDIA_SIGNATURE_INVALID}; past expiry → 403
 * {@code MEDIA_URL_EXPIRED}. A valid request continues with {@code Cache-Control: private, max-age=min(exp − now, 3600)}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class SignedMediaFilter extends OncePerRequestFilter {

    static final String PREFIX = "/uploads/";
    static final String REQUIRED_MESSAGE = "Lien de média non signé : accès refusé.";
    static final String INVALID_MESSAGE = "Lien de média invalide : accès refusé.";
    static final String EXPIRED_MESSAGE = "Lien de média expiré : rechargez la page.";

    private final FileStorageService storage;
    private final Clock clock;

    public SignedMediaFilter(FileStorageService storage, Clock clock) {
        this.storage = storage;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !pathWithinApplication(request).startsWith(PREFIX);
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String rawPath = pathWithinApplication(request).substring(PREFIX.length());
        Optional<String> path = safePath(rawPath);
        if (path.isEmpty() || !storage.isInsideRoot(path.get())) {
            response.setStatus(HttpStatus.NOT_FOUND.value());
            response.setContentLength(0);
            return;
        }
        MediaUrlSigner signer = storage.signer();
        long now = clock.instant().getEpochSecond();
        String exp = request.getParameter("exp");
        MediaUrlSigner.Verdict verdict = signer.verify(path.get(), exp, request.getParameter("sig"), clock.instant());
        switch (verdict) {
            case MISSING -> reject(request, response, "MEDIA_SIGNATURE_REQUIRED", REQUIRED_MESSAGE);
            case INVALID -> reject(request, response, "MEDIA_SIGNATURE_INVALID", INVALID_MESSAGE);
            case EXPIRED -> reject(request, response, "MEDIA_URL_EXPIRED", EXPIRED_MESSAGE);
            case VALID -> {
                // Refills the local cache from R2 when the file is gone (ephemeral disk) before it is served.
                storage.resolve(path.get());
                long maxAge = Math.max(0, Math.min(Long.parseLong(exp) - now, 3600));
                chain.doFilter(request, new CacheControlResponse(response, "private, max-age=" + maxAge));
            }
        }
    }

    /**
     * Decoded, normalised path; empty on a traversal attempt ({@code ..}, {@code .}, backslash, NUL, encoded
     * slash tricks) or a malformed escape.
     */
    static Optional<String> safePath(String rawPath) {
        if (rawPath == null || rawPath.isEmpty()) {
            return Optional.empty();
        }
        Optional<String> decoded = MediaUrlSigner.decodePath(rawPath);
        if (decoded.isEmpty()) {
            return Optional.empty();
        }
        String value = decoded.get();
        // A '%' left after one decoding is a double-encoded escape (e.g. %252E%252E): treated as traversal.
        if (value.indexOf('\\') >= 0 || value.indexOf('\0') >= 0 || value.indexOf('%') >= 0 || value.startsWith("/")) {
            return Optional.empty();
        }
        return MediaUrlSigner.normalise(value);
    }

    private static void reject(HttpServletRequest request, HttpServletResponse response, String code, String message)
            throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.getWriter().write(ApiErrorBody.toJson(
                ApiErrorBody.of(HttpStatus.FORBIDDEN, code, message, request.getRequestURI(), null)));
        response.getWriter().flush();
    }

    private static String pathWithinApplication(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (uri == null) {
            return "";
        }
        return context != null && !context.isEmpty() && uri.startsWith(context) ? uri.substring(context.length()) : uri;
    }

    /** Forces the signed-URL cache policy whatever the resource handler writes afterwards. */
    private static final class CacheControlResponse extends jakarta.servlet.http.HttpServletResponseWrapper {

        private final String cacheControl;

        CacheControlResponse(HttpServletResponse response, String cacheControl) {
            super(response);
            this.cacheControl = cacheControl;
            response.setHeader(HttpHeaders.CACHE_CONTROL, cacheControl);
        }

        @Override
        public void setHeader(String name, String value) {
            super.setHeader(name, isCacheHeader(name) ? cacheControl : value);
        }

        @Override
        public void addHeader(String name, String value) {
            if (isCacheHeader(name)) {
                super.setHeader(name, cacheControl);
            } else {
                super.addHeader(name, value);
            }
        }

        private static boolean isCacheHeader(String name) {
            return HttpHeaders.CACHE_CONTROL.equalsIgnoreCase(name);
        }
    }
}
