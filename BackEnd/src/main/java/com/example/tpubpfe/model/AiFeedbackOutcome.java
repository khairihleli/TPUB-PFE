package com.example.tpubpfe.model;

/** Comparaison entre l'avis de l'IA et la décision de l'administrateur (docs/round2-contract.md §2.6). */
public enum AiFeedbackOutcome {
    CONFIRMED_APPROVAL,
    FALSE_NEGATIVE,
    FALSE_POSITIVE,
    CONFIRMED_FLAG
}
