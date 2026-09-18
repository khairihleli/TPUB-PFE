package com.example.zelqanepfe.service;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.dto.DeviceKeyIssuedResponse;
import com.example.zelqanepfe.dto.DeviceKeyStatusResponse;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.SupportDeviceKey;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.SupportDeviceKeyRepository;
import com.example.zelqanepfe.security.SecretKeys;
import com.example.zelqanepfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Player device keys: issue/rotate, revoke, status and authentication (docs/round2-contract.md §3.4). */
@Service
@RequiredArgsConstructor
public class DeviceKeyService {

    public static final String KEY_PREFIX = "tpd_";
    public static final Pattern KEY_PATTERN = Pattern.compile("^tpd_[A-Za-z0-9_-]{43}$");
    static final int PREFIX_LENGTH = 12;

    private final SupportDeviceKeyRepository keyRepository;
    private final DiffusionSupportRepository supportRepository;
    private final AuditService auditService;
    private final ZelqaneProperties properties;
    private final Clock clock;

    /** Outcome of a key check. */
    public enum Authentication {
        VALID,
        INVALID
    }

    /** {@code tpd_} + base64url (no padding) of 32 random bytes: 47 characters. */
    public static String generateKey() {
        return KEY_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(SecretKeys.randomBytes(32));
    }

    /** Issues a key; an existing active key is revoked with reason {@code ROTATED}. The clear key is returned once. */
    @Transactional
    public DeviceKeyIssuedResponse issue(Long supportId) {
        DiffusionSupport support = supportRepository.findById(supportId).orElseThrow(NetworkErrors::supportNotFound);
        Instant now = clock.instant();
        Long actorId = actorId();
        List<SupportDeviceKey> active = keyRepository.findBySupportIdAndRevokedAtIsNull(support.getId());
        for (SupportDeviceKey existing : active) {
            existing.setRevokedAt(now);
            existing.setRevokedByUserId(actorId);
            existing.setRevokeReason(SupportDeviceKey.RevokeReason.ROTATED);
        }
        keyRepository.saveAll(active);
        keyRepository.flush();
        String key = generateKey();
        SupportDeviceKey saved = keyRepository.save(SupportDeviceKey.builder()
                .supportId(support.getId())
                .keyHash(SecretKeys.sha256Hex(key))
                .keyPrefix(key.substring(0, PREFIX_LENGTH))
                .createdByUserId(actorId)
                .createdAt(now)
                .build());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("keyPrefix", saved.getKeyPrefix());
        boolean rotated = !active.isEmpty();
        auditService.record(rotated ? "SUPPORT_DEVICE_KEY_ROTATED" : "SUPPORT_DEVICE_KEY_ISSUED", "SUPPORT_DEVICE",
                support.getId(), (rotated ? "Nouvelle clé d'appareil (rotation) pour « " : "Appairage de l'écran « ")
                        + support.getName() + " »", details);
        return DeviceKeyIssuedResponse.builder()
                .supportId(support.getId())
                .deviceKey(key)
                .keyPrefix(saved.getKeyPrefix())
                .createdAt(saved.getCreatedAt())
                .pairingPath("/ecran/" + support.getId() + "?cle=" + key)
                .build();
    }

    /** Revokes the active key (no-op without one). */
    @Transactional
    public void revoke(Long supportId) {
        DiffusionSupport support = supportRepository.findById(supportId).orElseThrow(NetworkErrors::supportNotFound);
        List<SupportDeviceKey> active = keyRepository.findBySupportIdAndRevokedAtIsNull(support.getId());
        if (active.isEmpty()) {
            return;
        }
        Instant now = clock.instant();
        Long actorId = actorId();
        for (SupportDeviceKey key : active) {
            key.setRevokedAt(now);
            key.setRevokedByUserId(actorId);
            key.setRevokeReason(SupportDeviceKey.RevokeReason.REVOKED);
        }
        keyRepository.saveAll(active);
        auditService.record("SUPPORT_DEVICE_KEY_REVOKED", "SUPPORT_DEVICE", support.getId(),
                "Révocation de la clé d'appareil de « " + support.getName() + " »",
                Map.of("keyPrefix", active.get(0).getKeyPrefix()));
    }

    @Transactional(readOnly = true)
    public DeviceKeyStatusResponse status(Long supportId) {
        DiffusionSupport support = supportRepository.findById(supportId).orElseThrow(NetworkErrors::supportNotFound);
        return toStatus(support, keyRepository.findFirstBySupportIdAndRevokedAtIsNullOrderByIdDesc(support.getId()).orElse(null));
    }

    @Transactional(readOnly = true)
    public List<DeviceKeyStatusResponse> list() {
        Map<Long, SupportDeviceKey> active = keyRepository.findByRevokedAtIsNull().stream()
                .collect(Collectors.toMap(SupportDeviceKey::getSupportId, Function.identity(),
                        (a, b) -> a.getId() > b.getId() ? a : b));
        return supportRepository.findAll(Sort.by("id")).stream()
                .map(support -> toStatus(support, active.get(support.getId())))
                .toList();
    }

    /**
     * Checks {@code key} against the active key of {@code supportId} (constant-time comparison of the SHA-256 hex)
     * and touches {@code last_used_at}/{@code last_used_ip} at most every {@code zelqane.device.touch-seconds}.
     */
    @Transactional
    public Authentication authenticate(Long supportId, String key, String ip) {
        if (key == null || !KEY_PATTERN.matcher(key).matches()) {
            return Authentication.INVALID;
        }
        Optional<SupportDeviceKey> active = keyRepository.findFirstBySupportIdAndRevokedAtIsNullOrderByIdDesc(supportId);
        if (active.isEmpty()) {
            return Authentication.INVALID;
        }
        SupportDeviceKey stored = active.get();
        if (!MessageDigest.isEqual(stored.getKeyHash().getBytes(StandardCharsets.US_ASCII),
                SecretKeys.sha256Hex(key).getBytes(StandardCharsets.US_ASCII))) {
            return Authentication.INVALID;
        }
        Instant now = clock.instant();
        long touch = Math.max(0, properties.getDevice().getTouchSeconds());
        if (stored.getLastUsedAt() == null || Duration.between(stored.getLastUsedAt(), now).getSeconds() >= touch) {
            stored.setLastUsedAt(now);
            stored.setLastUsedIp(ip);
            keyRepository.save(stored);
        }
        return Authentication.VALID;
    }

    private static DeviceKeyStatusResponse toStatus(DiffusionSupport support, SupportDeviceKey key) {
        return DeviceKeyStatusResponse.builder()
                .supportId(support.getId())
                .supportName(support.getName())
                .paired(key != null)
                .keyPrefix(key == null ? null : key.getKeyPrefix())
                .createdAt(key == null ? null : key.getCreatedAt())
                .lastUsedAt(key == null ? null : key.getLastUsedAt())
                .lastUsedIp(key == null ? null : key.getLastUsedIp())
                .build();
    }

    private static Long actorId() {
        UserDetailsImpl actor = SecurityUtils.currentUserOrNull();
        return actor == null ? null : actor.getId();
    }
}
