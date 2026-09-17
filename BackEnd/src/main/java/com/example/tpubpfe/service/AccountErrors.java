package com.example.tpubpfe.service;

import com.example.tpubpfe.exception.ApiException;
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
        return new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_DISABLED", "Ce compte est désactivé. Contactez TPUB.");
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

    public static ApiException logoTooLarge() {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", "Le logo ne doit pas dépasser 2 Mo.");
    }
}
