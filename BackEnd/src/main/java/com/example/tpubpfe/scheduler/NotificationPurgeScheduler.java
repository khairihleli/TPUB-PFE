package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.service.notification.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Deletes read notifications older than the retention (docs/round2-contract.md §5.5). */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationPurgeScheduler {

    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 4 * * *")
    public void runOnce() {
        int purged = notificationService.purge();
        if (purged > 0) {
            log.info("Notifications purgées : {}", purged);
        }
    }
}
