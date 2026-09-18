package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** Freshly generated recovery codes, shown once. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecoveryCodesResponse {

    private List<String> recoveryCodes;
}
