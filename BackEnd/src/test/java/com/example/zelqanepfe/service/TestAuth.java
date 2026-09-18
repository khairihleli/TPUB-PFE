package com.example.zelqanepfe.service;

import com.example.zelqanepfe.security.UserDetailsImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** Test helper: installs an authenticated principal in the security context. */
public final class TestAuth {

    private TestAuth() {
    }

    public static UserDetailsImpl login(Long userId, String role) {
        UserDetailsImpl user = new UserDetailsImpl(userId, "user" + userId + "@zelqane.test", "x", "Utilisateur " + userId,
                role, true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        return user;
    }

    public static void logout() {
        SecurityContextHolder.clearContext();
    }
}
