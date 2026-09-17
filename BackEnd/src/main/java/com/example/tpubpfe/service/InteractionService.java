package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.InteractionRequest;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionInteraction;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.repository.DiffusionInteractionRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
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
        DiffusionLog log = diffusionLogRepository.findById(request.getDiffusionLogId())
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
