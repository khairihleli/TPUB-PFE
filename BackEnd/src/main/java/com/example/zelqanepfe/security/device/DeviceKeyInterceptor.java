package com.example.zelqanepfe.security.device;

import com.example.zelqanepfe.exception.ApiErrorBody;
import com.example.zelqanepfe.security.RequestInfo;
import com.example.zelqanepfe.service.DeviceKeyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Authenticates the player routes with {@code X-ZELQANE-Device-Key} (docs/round2-contract.md §3.4). Checks, in order:
 * IP failure limit (429), {@code supportId} (400), header present (401 {@code DEVICE_KEY_REQUIRED}), key valid for
 * the support (401 {@code DEVICE_KEY_INVALID}, counted per IP), token bucket per support (429 with
 * {@code Retry-After}); then sets {@link DeviceRequest#SUPPORT_ID_ATTRIBUTE}.
 */
public class DeviceKeyInterceptor implements HandlerInterceptor {

    static final String REQUIRED_MESSAGE = "Écran non appairé : clé d'appareil manquante.";
    static final String INVALID_MESSAGE = "Clé d'appareil invalide ou révoquée.";
    static final String RATE_LIMITED_MESSAGE = "Trop de requêtes pour cet écran.";
    static final String IP_LIMITED_MESSAGE = "Trop de tentatives avec une clé d'appareil invalide : réessayez dans une minute.";

    private final DeviceKeyService deviceKeyService;
    private final DeviceRateLimiter rateLimiter;

    public DeviceKeyInterceptor(DeviceKeyService deviceKeyService, DeviceRateLimiter rateLimiter) {
        this.deviceKeyService = deviceKeyService;
        this.rateLimiter = rateLimiter;
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws IOException {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        String ip = RequestInfo.clientIp(request);
        if (rateLimiter.isIpBlocked(ip)) {
            response.setHeader(HttpHeaders.RETRY_AFTER, "60");
            return reject(request, response, HttpStatus.TOO_MANY_REQUESTS, "DEVICE_RATE_LIMITED", IP_LIMITED_MESSAGE, null);
        }
        String rawSupportId = request.getParameter("supportId");
        Long supportId = parseId(rawSupportId);
        if (supportId == null) {
            return reject(request, response, HttpStatus.BAD_REQUEST, "MISSING_PARAMETER",
                    "Paramètre obligatoire manquant : « supportId ».", Map.of("supportId", "Champ obligatoire."));
        }
        String key = request.getHeader(DeviceRequest.HEADER);
        if (key == null || key.isBlank()) {
            return reject(request, response, HttpStatus.UNAUTHORIZED, "DEVICE_KEY_REQUIRED", REQUIRED_MESSAGE, null);
        }
        if (deviceKeyService.authenticate(supportId, key.trim(), ip) != DeviceKeyService.Authentication.VALID) {
            rateLimiter.recordFailure(ip);
            return reject(request, response, HttpStatus.UNAUTHORIZED, "DEVICE_KEY_INVALID", INVALID_MESSAGE, null);
        }
        DeviceRateLimiter.Decision decision = rateLimiter.tryAcquire(supportId);
        if (!decision.allowed()) {
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()));
            return reject(request, response, HttpStatus.TOO_MANY_REQUESTS, "DEVICE_RATE_LIMITED", RATE_LIMITED_MESSAGE, null);
        }
        request.setAttribute(DeviceRequest.SUPPORT_ID_ATTRIBUTE, supportId);
        return true;
    }

    static Long parseId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            long value = Long.parseLong(raw.trim());
            return value > 0 ? value : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static boolean reject(HttpServletRequest request, HttpServletResponse response, HttpStatus status,
                                  String code, String message, Map<String, String> errors) throws IOException {
        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(ApiErrorBody.toJson(
                ApiErrorBody.of(status, code, message, request.getRequestURI(), errors)));
        response.getWriter().flush();
        return false;
    }
}
