package com.example.tpubpfe.service;

import com.example.tpubpfe.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * Stable error codes of lane A (campaign lifecycle, zones, AI). Messages are French.
 */
public final class CampaignErrors {

    private CampaignErrors() {
    }

    public static ApiException campaignNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "CAMPAIGN_NOT_FOUND", "Campagne introuvable.");
    }

    public static ApiException notEditable() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_NOT_EDITABLE",
                "Cette campagne ne peut plus être modifiée dans son statut actuel.");
    }

    public static ApiException notSubmittable() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_NOT_SUBMITTABLE",
                "Seule une campagne en brouillon peut être soumise.");
    }

    public static ApiException submitIncomplete(Map<String, String> errors) {
        return new ApiException(HttpStatus.BAD_REQUEST, "SUBMIT_INCOMPLETE",
                "La campagne est incomplète : complétez les éléments signalés avant de la soumettre.", errors);
    }

    public static ApiException clientNotAllowed(HttpStatus status) {
        return new ApiException(status, "CLIENT_NOT_ALLOWED",
                "Votre compte annonceur n'est pas autorisé à effectuer cette action. Contactez TPUB.");
    }

    public static ApiException clientProfileMissing() {
        return new ApiException(HttpStatus.FORBIDDEN, "CLIENT_NOT_ALLOWED",
                "Aucun profil annonceur n'est associé à ce compte.");
    }

    public static ApiException invalidPeriod() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD",
                "La date de fin doit être postérieure ou égale à la date de début.");
    }

    public static ApiException invalidTimeRange() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TIME_RANGE",
                "Créneau horaire invalide : renseignez une heure de début antérieure à l'heure de fin.");
    }

    public static ApiException startDateInPast() {
        return new ApiException(HttpStatus.BAD_REQUEST, "START_DATE_IN_PAST",
                "La date de début ne peut pas être dans le passé.");
    }

    public static ApiException notReviewable() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_NOT_REVIEWABLE",
                "Cette décision n'est pas possible dans le statut actuel de la campagne.");
    }

    public static ApiException aiOverrideRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "AI_OVERRIDE_REQUIRED",
                "L'IA demande une vérification : confirmez explicitement la validation malgré son avis.");
    }

    public static ApiException periodOver() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_PERIOD_OVER",
                "La période de diffusion de cette campagne est déjà terminée.");
    }

    public static ApiException noReservationToConfirm() {
        return new ApiException(HttpStatus.CONFLICT, "NO_RESERVATION_TO_CONFIRM",
                "Aucune réservation temporaire en cours à confirmer pour cette campagne.");
    }

    public static ApiException rejectReasonRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "REJECT_REASON_REQUIRED",
                "Le motif du refus est obligatoire (3 à 1000 caractères).");
    }

    public static ApiException priorityNotEditable() {
        return new ApiException(HttpStatus.CONFLICT, "PRIORITY_NOT_EDITABLE",
                "La priorité ne peut pas être modifiée dans le statut actuel de la campagne.");
    }

    public static ApiException zoneLimitExceeded() {
        return new ApiException(HttpStatus.BAD_REQUEST, "ZONE_LIMIT_EXCEEDED",
                "Une campagne peut cibler au maximum 5 zones.");
    }

    public static ApiException invalidZone() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ZONE",
                "Aucune zone TPUB active ne permet de rattacher ce point.");
    }

    public static ApiException notEligibleForAi() {
        return new ApiException(HttpStatus.CONFLICT, "CAMPAIGN_NOT_ELIGIBLE_FOR_AI",
                "L'analyse IA n'est pas disponible pour cette campagne dans son statut actuel.");
    }

    public static ApiException aiReportNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "AI_REPORT_NOT_FOUND",
                "Aucun rapport d'analyse IA n'existe encore pour cette campagne.");
    }

    public static ApiException aiRuleNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "AI_RULE_NOT_FOUND", "Règle de modération introuvable.");
    }

    public static ApiException aiRuleNameTaken() {
        return new ApiException(HttpStatus.CONFLICT, "AI_RULE_NAME_TAKEN",
                "Une règle de modération porte déjà ce nom.", Map.of("ruleName", "AI_RULE_NAME_TAKEN"));
    }

    public static ApiException invalidRegex(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REGEX",
                "Expression régulière invalide : " + detail, Map.of("pattern", "INVALID_REGEX"));
    }

    public static ApiException invalidParameter(String name, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", message, Map.of(name, message));
    }

    public static ApiException validationFailed(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message, Map.of(field, message));
    }
}
