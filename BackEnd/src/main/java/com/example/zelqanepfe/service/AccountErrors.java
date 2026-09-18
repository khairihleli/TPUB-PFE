package com.example.zelqanepfe.service;

import com.example.zelqanepfe.exception.ApiException;
import org.springframework.http.HttpStatus;

/**
 * Stable error codes of lane C (accounts, profile, sessions, admin users). Messages are French.
 */
public final class AccountErrors {

    private AccountErrors() {
    }

    public static ApiException badCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "E-mail ou mot de passe incorrect.");
    }

    public static ApiException accountDisabled() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_DISABLED", "Ce compte est désactivé. Contactez ZELQANE.");
    }

    public static ApiException unauthenticated() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentification requise.");
    }

    public static ApiException emailAlreadyRegistered() {
        return new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_REGISTERED",
                "Un compte existe déjà avec cette adresse e-mail.");
    }

    public static ApiException userNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    public static ApiException clientNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "CLIENT_NOT_FOUND", "Compte annonceur introuvable.");
    }

    public static ApiException sessionNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", "Session introuvable.");
    }

    public static ApiException invalidCurrentPassword() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD", "Le mot de passe actuel est incorrect.");
    }

    public static ApiException passwordReused() {
        return new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_REUSED",
                "Le nouveau mot de passe doit être différent de l'actuel.");
    }

    public static ApiException roleNotAllowed(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "ROLE_NOT_ALLOWED", message);
    }

    public static ApiException cannotDeactivateSelf() {
        return new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_DEACTIVATE_SELF",
                "Vous ne pouvez pas désactiver votre propre compte.");
    }

    public static ApiException lastAdmin() {
        return new ApiException(HttpStatus.BAD_REQUEST, "LAST_ADMIN",
                "Impossible : c'est le dernier compte administrateur actif.");
    }

    public static ApiException logoTypeUnsupported() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "MEDIA_TYPE_UNSUPPORTED",
                "Format de logo non pris en charge : utilisez PNG, JPEG ou WEBP.");
    }

    // --- Round 2 (L2): 2FA, forced password change -------------------------------------------------------------

    public static ApiException passwordChangeRequired() {
        return new ApiException(HttpStatus.FORBIDDEN, "PASSWORD_CHANGE_REQUIRED",
                "Vous devez définir un nouveau mot de passe avant de continuer.");
    }

    public static ApiException challengeExpired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "CHALLENGE_EXPIRED", "La vérification a expiré. Reconnectez-vous.");
    }

    /** 401 on the login second step, 400 on self-service routes. */
    public static ApiException totpCodeInvalid(HttpStatus status) {
        return new ApiException(status, "TOTP_CODE_INVALID", "Code de vérification incorrect.");
    }

    public static ApiException totpAlreadyEnabled() {
        return new ApiException(HttpStatus.CONFLICT, "TOTP_ALREADY_ENABLED", "La double authentification est déjà active.");
    }

    public static ApiException totpSetupRequired() {
        return new ApiException(HttpStatus.CONFLICT, "TOTP_SETUP_REQUIRED",
                "Aucune configuration en cours ou configuration expirée : recommencez l'activation.");
    }

    public static ApiException totpNotEnabled() {
        return new ApiException(HttpStatus.CONFLICT, "TOTP_NOT_ENABLED", "La double authentification n'est pas active.");
    }

    public static ApiException totpRequiredForRole() {
        return new ApiException(HttpStatus.FORBIDDEN, "TOTP_REQUIRED_FOR_ROLE",
                "La double authentification est obligatoire pour votre rôle : elle ne peut pas être désactivée.");
    }

    public static ApiException logoTooLarge() {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", "Le logo ne doit pas dépasser 2 Mo.");
    }
}
