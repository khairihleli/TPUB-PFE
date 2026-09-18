package com.example.zelqanepfe.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Presence of the reason is checked in the service ({@code REJECT_REASON_REQUIRED}). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminRejectRequest {

    @Size(max = 1000)
    private String reason;
}
