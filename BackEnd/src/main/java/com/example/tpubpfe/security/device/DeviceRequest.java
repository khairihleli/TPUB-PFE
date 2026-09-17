package com.example.tpubpfe.security.device;

/** Device authentication of player routes (docs/round2-contract.md §1.1). */
public final class DeviceRequest {

    public static final String HEADER = "X-TPUB-Device-Key";
    /** Request attribute (Long) set once the key matched the {@code supportId} query parameter. */
    public static final String SUPPORT_ID_ATTRIBUTE = "tpub.device.supportId";

    private DeviceRequest() {
    }
}
