package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.EmergencyStopReason;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.service.DiffusionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Stops active emergency messages whose window is over (contract §2.8): isActive=false, stopReason=AUTO.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmergencyAutoStopScheduler {

    private final EmergencyMessageRepository emergencyMessageRepository;
    private final Clock clock;

    @Scheduled(cron = "0 * * * * *")
    @Transactional
    public void runOnce() {
        LocalDateTime now = LocalDateTime.now(clock);
        Instant instant = Instant.now(clock);
        List<EmergencyMessage> stopped = new ArrayList<>();
        for (EmergencyMessage message : emergencyMessageRepository.findByIsActiveTrue()) {
            if (DiffusionService.endAt(message).isBefore(now)) {
                message.setIsActive(false);
                message.setStoppedAt(instant);
                message.setStopReason(EmergencyStopReason.AUTO);
                stopped.add(message);
            }
        }
        if (!stopped.isEmpty()) {
            emergencyMessageRepository.saveAll(stopped);
            log.info("Messages d'urgence arrêtés automatiquement : {}", stopped.size());
        }
    }
}
