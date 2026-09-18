package com.example.zelqanepfe.service;

import com.example.zelqanepfe.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * Stable error codes of lane B (media, zones, supports, availability, reservations, diffusion, emergencies,
 * statistics). Messages are French.
 */
public final class NetworkErrors {

    private NetworkErrors() {
    }

    // --- generic -------------------------------------------------------------------------------------------------

    public static ApiException missingParameter(String name, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", message, Map.of(name, message));
    }

    public static ApiException invalidRange(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RANGE", message);
    }

    public static ApiException invalidTimeRange() {
        return CampaignErrors.invalidTimeRange();
    }

    // --- media ---------------------------------------------------------------------------------------------------

    public static ApiException mediaTypeUnsupported() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "MEDIA_TYPE_UNSUPPORTED",
                "Format non pris en charge : utilisez JPEG, PNG, WEBP, GIF, MP4 ou WEBM.");
    }

    public static ApiException mediaContentMismatch() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "MEDIA_CONTENT_MISMATCH",
                "Le contenu du fichier ne correspond pas au format annoncé.");
    }

    public static ApiException mediaTooLarge(long maxBytes) {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE",
                "Fichier trop volumineux (maximum " + (maxBytes / (1024 * 1024)) + " Mo).");
    }

    public static ApiException mediaLimitReached(int max) {
        return new ApiException(HttpStatus.BAD_REQUEST, "MEDIA_LIMIT_REACHED",
                "Nombre maximal de médias atteint pour cette campagne (" + max + ").");
    }

    public static ApiException mediaNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND", "Média introuvable.");
    }

    // --- zones & supports ----------------------------------------------------------------------------------------

    public static ApiException zoneNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "ZONE_NOT_FOUND", "Zone introuvable.");
    }

    public static ApiException zoneInUse() {
        return new ApiException(HttpStatus.CONFLICT, "ZONE_IN_USE",
                "Cette zone est utilisée (Porteurs, campagnes, réservations, urgences ou diffusions) : désactivez-la plutôt.");
    }

    public static ApiException supportNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "SUPPORT_NOT_FOUND", "Porteur introuvable.");
    }

    public static ApiException supportBlockNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "SUPPORT_BLOCK_NOT_FOUND", "Indisponibilité introuvable.");
    }

    // --- reservations --------------------------------------------------------------------------------------------

    public static ApiException campaignNotReservable() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_NOT_RESERVABLE",
                "Les réservations ne sont modifiables que sur une campagne en brouillon.");
    }

    public static ApiException reservationOutsideCampaignPeriod() {
        return new ApiException(HttpStatus.BAD_REQUEST, "RESERVATION_OUTSIDE_CAMPAIGN_PERIOD",
                "La réservation doit rester dans la période et le créneau horaire de la campagne.");
    }

    public static ApiException campaignZoneRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "CAMPAIGN_ZONE_REQUIRED",
                "Ciblez d'abord au moins une zone sur la carte avant de réserver des Porteurs.");
    }

    public static ApiException byCode(String code) {
        return switch (code) {
            case "SUPPORT_OUTSIDE_CAMPAIGN_ZONE" -> new ApiException(HttpStatus.BAD_REQUEST, code,
                    "Ce Porteur est en dehors des zones ciblées par la campagne.");
            case "RESERVATION_DUPLICATE" -> new ApiException(HttpStatus.CONFLICT, code,
                    "Cette campagne a déjà réservé ce Porteur sur ce créneau.");
            case "SUPPORT_UNAVAILABLE" -> new ApiException(HttpStatus.CONFLICT, code,
                    "Ce Porteur est en maintenance ou hors ligne sur ce créneau.");
            case "SUPPORT_ALREADY_RESERVED" -> new ApiException(HttpStatus.CONFLICT, code,
                    "Ce Porteur est déjà réservé sur ce créneau.");
            case "SUPPORT_NOT_FOUND" -> supportNotFound();
            default -> new ApiException(HttpStatus.BAD_REQUEST, code, "Réservation impossible.");
        };
    }

    public static ApiException batchConflict(Map<String, String> errors) {
        return new ApiException(HttpStatus.CONFLICT, "BATCH_CONFLICT",
                "Certains Porteurs ne peuvent pas être réservés : aucune réservation n'a été créée.", errors);
    }

    public static ApiException reservationNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RESERVATION_NOT_FOUND", "Réservation introuvable.");
    }

    public static ApiException reservationNotCancellable() {
        return new ApiException(HttpStatus.CONFLICT, "RESERVATION_NOT_CANCELLABLE",
                "Cette réservation ne peut pas être annulée dans son état actuel.");
    }

    // --- diffusion -----------------------------------------------------------------------------------------------

    public static ApiException supportZoneMismatch() {
        return new ApiException(HttpStatus.BAD_REQUEST, "SUPPORT_ZONE_MISMATCH",
                "Ce Porteur n'appartient pas à la zone indiquée.");
    }

    public static ApiException diffusionLogNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "DIFFUSION_LOG_NOT_FOUND", "Diffusion introuvable.");
    }

    public static ApiException interactionNotAllowed() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INTERACTION_NOT_ALLOWED",
                "Les interactions ne sont enregistrées que pour une publicité.");
    }

    public static ApiException interactionExpired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INTERACTION_EXPIRED",
                "Cette diffusion est trop ancienne pour enregistrer une interaction.");
    }

    // --- emergencies ---------------------------------------------------------------------------------------------

    public static ApiException emergencyNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "EMERGENCY_NOT_FOUND", "Message d'urgence introuvable.");
    }

    public static ApiException emergencyTargetRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "EMERGENCY_TARGET_REQUIRED",
                "Choisissez une zone ou un cercle complet (latitude, longitude et rayon).");
    }

    public static ApiException invalidEmergencyWindow() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EMERGENCY_WINDOW",
                "La fin de diffusion doit être postérieure au début et à l'instant présent.");
    }

    public static ApiException emergencyTargetConflict() {
        return new ApiException(HttpStatus.BAD_REQUEST, "EMERGENCY_TARGET_CONFLICT",
                "Choisissez un cercle ou un polygone, pas les deux.");
    }

    // --- polygons (round 2, docs/round2-contract.md §4.2) ----------------------------------------------------------

    /** 400 INVALID_POLYGON with {@code errors = {field: reason}}; the message is the reason itself. */
    public static ApiException invalidPolygon(String field, String reason) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_POLYGON", reason, Map.of(field, reason));
    }

    // --- statistics ----------------------------------------------------------------------------------------------

    public static ApiException exportTypeInvalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "EXPORT_TYPE_INVALID",
                "Type d'export invalide : utilisez views, dashboard, mine ou campaign.");
    }

    public static ApiException accessDenied() {
        return new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé.");
    }
}
