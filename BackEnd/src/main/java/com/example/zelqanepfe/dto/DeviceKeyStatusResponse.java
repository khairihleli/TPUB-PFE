package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Pairing state of a Porteur (never the key itself). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeviceKeyStatusResponse {

    private Long supportId;
    private String supportName;
    private boolean paired;
    private String keyPrefix;
    private Instant createdAt;
    private Instant lastUsedAt;
    private String lastUsedIp;
}
