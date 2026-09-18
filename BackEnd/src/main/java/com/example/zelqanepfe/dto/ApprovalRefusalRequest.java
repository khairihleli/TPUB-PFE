package com.example.zelqanepfe.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Body of the emergency refusal endpoint; the reason is checked in the service. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalRefusalRequest {

    @Size(max = 500)
    private String reason;
}
