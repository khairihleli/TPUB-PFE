package com.example.tpubpfe.security;

import com.example.tpubpfe.exception.ApiErrorBody;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * JSON 401/403 bodies for the security chain (same shape as the controller advice).
 */
@Component
public class SecurityErrorWriter implements AuthenticationEntryPoint, AccessDeniedHandler {

    public static final String UNAUTHENTICATED_MESSAGE = "Authentification requise.";
    public static final String ACCESS_DENIED_MESSAGE = "Accès refusé : votre rôle ne permet pas cette action.";

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        write(request, response, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        write(request, response, HttpStatus.FORBIDDEN, "ACCESS_DENIED", ACCESS_DENIED_MESSAGE);
    }

    public void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String code,
                      String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        if (status == HttpStatus.UNAUTHORIZED) {
            response.setHeader("WWW-Authenticate", "Bearer");
        }
        response.getWriter().write(ApiErrorBody.toJson(
                ApiErrorBody.of(status, code, message, request.getRequestURI(), null)));
        response.getWriter().flush();
    }
}
