package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.InteractionRequest;
import com.example.zelqanepfe.model.DiffusionContentType;
import com.example.zelqanepfe.model.DiffusionInteraction;
import com.example.zelqanepfe.model.DiffusionLog;
import com.example.zelqanepfe.repository.DiffusionInteractionRepository;
import com.example.zelqanepfe.repository.DiffusionLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Clicks and interactions reported by players on a PUBLICITE diffusion (contract §2.5). Idempotent per (log, type).
 */
@Service
@RequiredArgsConstructor
public class InteractionService {

    static final Duration MAX_AGE = Duration.ofHours(1);

    private final DiffusionLogRepository diffusionLogRepository;
    private final DiffusionInteractionRepository interactionRepository;
    private final Clock clock;

    @Transactional
    public void record(InteractionRequest request) {
        record(request, null);
    }

    /**
     * Round 2: {@code supportId} is the authenticated device's support; a log of another support is reported as
     * 404 {@code DIFFUSION_LOG_NOT_FOUND} (no information leak). Null skips the check (internal callers).
     */
    @Transactional
    public void record(InteractionRequest request, Long supportId) {
        DiffusionLog log = diffusionLogRepository.findById(request.getDiffusionLogId())
                .filter(found -> supportId == null
                        || (found.getSupport() != null && supportId.equals(found.getSupport().getId())))
                .orElseThrow(NetworkErrors::diffusionLogNotFound);
        if (log.getContentType() != DiffusionContentType.PUBLICITE) {
            throw NetworkErrors.interactionNotAllowed();
        }
        if (log.getCreatedAt() != null && log.getCreatedAt().isBefore(Instant.now(clock).minus(MAX_AGE))) {
            throw NetworkErrors.interactionExpired();
        }
        if (interactionRepository.existsByDiffusionLogIdAndInteractionType(log.getId(), request.getType())) {
            return;
        }
        interactionRepository.save(DiffusionInteraction.builder()
                .diffusionLog(log)
                .campaign(log.getCampaign())
                .support(log.getSupport())
                .interactionType(request.getType())
                .build());
    }
}
