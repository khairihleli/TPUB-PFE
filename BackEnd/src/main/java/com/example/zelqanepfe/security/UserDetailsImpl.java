package com.example.zelqanepfe.security;

import com.example.zelqanepfe.model.User;
import lombok.Data;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Data
public class UserDetailsImpl implements UserDetails {

    private Long id;
    private String email;
    private String password;
    private String nom;
    private String roleCode;
    private boolean active;
    /** {@code user_sessions.id} of the bearer token; null outside a JWT-authenticated request. */
    private String sessionId;
    /** Round 2 (L2): the account must set a new password before any other action. */
    private boolean mustChangePassword;

    public UserDetailsImpl(Long id, String email, String password, String nom, String roleCode, boolean active) {
        this(id, email, password, nom, roleCode, active, null);
    }

    public UserDetailsImpl(Long id, String email, String password, String nom, String roleCode, boolean active,
                           String sessionId) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.nom = nom;
        this.roleCode = roleCode;
        this.active = active;
        this.sessionId = sessionId;
    }

    public UserDetailsImpl(Long id, String email, String password, String nom, String roleCode, boolean active,
                           String sessionId, boolean mustChangePassword) {
        this(id, email, password, nom, roleCode, active, sessionId);
        this.mustChangePassword = mustChangePassword;
    }

    public static UserDetailsImpl fromUser(User user) {
        return fromUser(user, null);
    }

    public static UserDetailsImpl fromUser(User user, String sessionId) {
        return new UserDetailsImpl(
                user.getId(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getNom(),
                user.getRole().getCode().name(),
                Boolean.TRUE.equals(user.getIsActive()),
                sessionId,
                Boolean.TRUE.equals(user.getMustChangePassword())
        );
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + roleCode));
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }
}
