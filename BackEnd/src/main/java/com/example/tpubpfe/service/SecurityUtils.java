package com.example.tpubpfe.service;

import com.example.tpubpfe.security.UserDetailsImpl;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static UserDetailsImpl getCurrentUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof UserDetailsImpl userDetails) {
            return userDetails;
        }
        throw new IllegalStateException("No authenticated user found");
    }

    public static String getCurrentUserEmail() {
        return getCurrentUser().getUsername();
    }
}
