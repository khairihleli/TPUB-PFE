package com.example.tpubpfe.model;

public enum EmergencyStopReason {
    MANUEL,
    AUTO,
    /** Refused during the multi-level approval (docs/round2-contract.md §5.4). */
    REFUSE
}
