package com.example.zelqanepfe.service;

import com.example.zelqanepfe.security.UserDetailsImpl;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    /** The authenticated principal, or 401 {@code UNAUTHENTICATED}. */
    public static UserDetailsImpl getCurrentUser() {
        UserDetailsImpl user = currentUserOrNull();
        if (user == null) {
            throw AccountErrors.unauthenticated();
        }
        return user;
    }

    public static UserDetailsImpl currentUserOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserDetailsImpl userDetails) {
            return userDetails;
        }
        return null;
    }

    public static String getCurrentUserEmail() {
        return getCurrentUser().getUsername();
    }

    /** {@code sid} of the current bearer token, or null. */
    public static String currentSessionId() {
        UserDetailsImpl user = currentUserOrNull();
        return user == null ? null : user.getSessionId();
    }
}
