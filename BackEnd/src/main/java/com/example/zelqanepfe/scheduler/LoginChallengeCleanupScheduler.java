package com.example.zelqanepfe.scheduler;

import com.example.zelqanepfe.service.LoginChallengeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly purge of login challenges expired for more than 24 hours (docs/round2-contract.md §3.6). */
@Slf4j
@Component
@RequiredArgsConstructor
public class LoginChallengeCleanupScheduler {

    private final LoginChallengeService challengeService;

    @Scheduled(cron = "0 0 * * * *")
    public int runOnce() {
        int deleted = challengeService.purgeExpired();
        if (deleted > 0) {
            log.info("Défis de connexion expirés supprimés : {}", deleted);
        }
        return deleted;
    }
}
