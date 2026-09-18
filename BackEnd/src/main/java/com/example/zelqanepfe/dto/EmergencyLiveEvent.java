package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Live state of an emergency message (docs/round2-contract.md §5.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmergencyLiveEvent {

    private Long emergencyId;
    private String title;
    private String urgencyLevel;
    /** PROGRAMME, EN_COURS, TERMINE, DESACTIVE, EN_ATTENTE_APPROBATION or REFUSE. */
    private String state;
    /** EN_ATTENTE, APPROUVE or REFUSE. */
    private String approvalStatus;
    private int approvalsCount;
    private int approvalsRequired;
    private long affectedSupports;
}
