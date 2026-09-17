package com.example.tpubpfe.model;

/** Type of a supervision alert (docs/round2-contract.md §5.3). */
public enum SupervisionAlertType {
    SUPPORT_OFFLINE,
    ZONE_SATURATION,
    EMERGENCY_PENDING_APPROVAL,
    CAMPAIGN_PENDING_APPROVAL
}
