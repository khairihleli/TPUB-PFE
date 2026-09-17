package com.example.tpubpfe.security;

import com.example.tpubpfe.service.AccountErrors;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Refuses every authenticated request of an account flagged {@code must_change_password} with 403
 * {@code PASSWORD_CHANGE_REQUIRED}, except reading the profile, changing the password, logging out and the 2FA
 * self-service routes (docs/round2-contract.md §3.2).
 */
public class PasswordChangeRequiredInterceptor implements HandlerInterceptor {

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl user)
                || !user.isMustChangePassword()) {
            return true;
        }
        if (isAllowed(request.getMethod(), pathWithinApplication(request))) {
            return true;
        }
        throw AccountErrors.passwordChangeRequired();
    }

    static boolean isAllowed(String method, String path) {
        if ("OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }
        if ("GET".equalsIgnoreCase(method) && "/api/me".equals(path)) {
            return true;
        }
        if ("POST".equalsIgnoreCase(method) && ("/api/me/password".equals(path) || "/api/me/logout".equals(path))) {
            return true;
        }
        return ("GET".equalsIgnoreCase(method) || "POST".equalsIgnoreCase(method))
                && (MATCHER.match("/api/me/2fa", path) || MATCHER.match("/api/me/2fa/**", path));
    }

    private static String pathWithinApplication(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (uri == null) {
            return "";
        }
        return context != null && !context.isEmpty() && uri.startsWith(context) ? uri.substring(context.length()) : uri;
    }
}
