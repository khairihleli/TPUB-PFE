package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.ai.learning.AiFeedbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Turns new administrator decisions into AI feedback every 10 minutes (docs/round2-contract.md §2.6). */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiFeedbackSyncScheduler {

    private final AiFeedbackService feedbackService;

    @Scheduled(cron = "0 */10 * * * *")
    public void runOnce() {
        try {
            feedbackService.sync();
        } catch (RuntimeException ex) {
            log.warn("Synchronisation des retours IA impossible : {}", ex.getMessage());
        }
    }
}
