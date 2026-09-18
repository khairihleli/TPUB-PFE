package com.example.zelqanepfe.security.totp;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.model.RoleCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/** Roles for which TOTP is mandatory ({@code zelqane.security.totp.required-roles}). */
@Slf4j
@Component
public class TotpPolicy {

    private final Set<RoleCode> requiredRoles;

    public TotpPolicy(ZelqaneProperties properties) {
        this.requiredRoles = parse(properties.getSecurity().getTotp().getRequiredRoles());
    }

    public static TotpPolicy of(Collection<String> roles) {
        ZelqaneProperties properties = new ZelqaneProperties();
        properties.getSecurity().getTotp().setRequiredRoles(roles == null ? java.util.List.of() : java.util.List.copyOf(roles));
        return new TotpPolicy(properties);
    }

    public boolean isRequired(RoleCode role) {
        return role != null && requiredRoles.contains(role);
    }

    public boolean isRequired(String roleCode) {
        if (roleCode == null) {
            return false;
        }
        try {
            return isRequired(RoleCode.valueOf(roleCode));
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    public Set<RoleCode> requiredRoles() {
        return Set.copyOf(requiredRoles);
    }

    static Set<RoleCode> parse(Collection<String> values) {
        Set<RoleCode> roles = EnumSet.noneOf(RoleCode.class);
        if (values == null) {
            return roles;
        }
        for (String raw : values) {
            if (raw == null) {
                continue;
            }
            for (String part : raw.split(",")) {
                String name = part.trim().toUpperCase(Locale.ROOT);
                if (name.isEmpty()) {
                    continue;
                }
                RoleCode role;
                try {
                    role = RoleCode.valueOf(name);
                } catch (IllegalArgumentException ex) {
                    log.warn("zelqane.security.totp.required-roles : rôle inconnu « {} » ignoré.", name);
                    continue;
                }
                if (role == RoleCode.ANNONCEUR) {
                    log.warn("zelqane.security.totp.required-roles : ANNONCEUR ne peut pas être obligatoire, ignoré.");
                    continue;
                }
                roles.add(role);
            }
        }
        return roles;
    }
}
