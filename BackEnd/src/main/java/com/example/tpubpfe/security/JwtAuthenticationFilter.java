package com.example.tpubpfe.security;

import com.example.tpubpfe.service.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Bearer-token authentication bound to a server-side session.
 * <ul>
 *   <li>The {@code Authorization} header is ignored on {@code /api/auth/login} and {@code /api/auth/register}.</li>
 *   <li>On a public route a rejected token is ignored (the request continues anonymously).</li>
 *   <li>On a protected route a rejected token ends the request with a JSON 401 carrying
 *       {@code TOKEN_INVALID | TOKEN_EXPIRED | SESSION_REVOKED | ACCOUNT_DISABLED}.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Set<String> CREDENTIAL_ROUTES = Set.of("/api/auth/login", "/api/auth/register");
    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private final SessionService sessionService;
    private final SecurityErrorWriter errorWriter;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String path = pathWithinApplication(request);
        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.regionMatches(true, 0, "Bearer ", 0, 7)
                || CREDENTIAL_ROUTES.contains(path)
                || SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            UserDetailsImpl user = sessionService.authenticate(authHeader.substring(7).trim());
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authToken);
        } catch (TokenRejectedException ex) {
            SecurityContextHolder.clearContext();
            if (!isPublic(path)) {
                errorWriter.write(request, response, HttpStatus.UNAUTHORIZED, ex.getCode(), ex.getMessage());
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    static boolean isPublic(String path) {
        for (String pattern : SecurityConfig.PUBLIC_ENDPOINTS) {
            if (MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
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
