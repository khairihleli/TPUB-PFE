package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One administrator decision in an approval cycle (docs/round2-contract.md §5.4). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalResponse {

    private Long id;
    private Long approverUserId;
    private String approverName;
    /** APPROUVE or REFUSE. */
    private String decision;
    private String comment;
    private Instant createdAt;
}
