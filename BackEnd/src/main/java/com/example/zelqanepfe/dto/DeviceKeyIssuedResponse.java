package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** {@code POST /api/supports/{id}/device-key}: the key is shown once. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeviceKeyIssuedResponse {

    private Long supportId;
    private String deviceKey;
    /** First 12 characters of the key. */
    private String keyPrefix;
    private Instant createdAt;
    /** {@code /ecran/{id}?cle={deviceKey}}. */
    private String pairingPath;
}
