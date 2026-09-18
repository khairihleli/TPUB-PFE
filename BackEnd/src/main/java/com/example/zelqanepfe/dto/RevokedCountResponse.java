package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** {@code { revoked: number }}: sessions closed by a bulk revocation. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RevokedCountResponse {

    private int revoked;
}
