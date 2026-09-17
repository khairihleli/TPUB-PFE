package com.example.tpubpfe.service.approval;

import com.example.tpubpfe.exception.ApiException;
import org.springframework.http.HttpStatus;

/** French errors of the multi-level approval (docs/round2-contract.md §5.4). */
public final class ApprovalErrors {

    private ApprovalErrors() {
    }

    public static ApiException alreadyGiven() {
        return new ApiException(HttpStatus.CONFLICT, "APPROVAL_ALREADY_GIVEN",
                "Vous avez déjà approuvé ce message.");
    }

    public static ApiException notPending() {
        return new ApiException(HttpStatus.CONFLICT, "APPROVAL_NOT_PENDING",
                "Ce message n'est pas en attente d'approbation.");
    }

    public static ApiException emergencyNotApprovable() {
        return new ApiException(HttpStatus.CONFLICT, "EMERGENCY_NOT_APPROVABLE",
                "Ce message n'est plus approuvable : il est arrêté ou terminé.");
    }

    public static ApiException selfRefusal() {
        return new ApiException(HttpStatus.CONFLICT, "APPROVAL_SELF_REFUSAL",
                "Vous ne pouvez pas refuser un message que vous avez créé.");
    }

    public static ApiException refusalReasonRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, "REFUSAL_REASON_REQUIRED",
                "Motif de refus obligatoire (3 à 500 caractères).");
    }

    public static ApiException alertNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND", "Alerte introuvable.");
    }
}
