package com.example.zelqanepfe.scheduler;

import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.repository.CampaignRepository;
import com.example.zelqanepfe.service.CampaignLifecycle;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Time-driven campaign transitions (contract §2.1): VALIDATED_BY_ADMIN → ACTIVE at the start date,
 * VALIDATED_BY_ADMIN | ACTIVE → TERMINATED when the period is over or the budget is exhausted.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CampaignLifecycleScheduler {

    private final CampaignRepository campaignRepository;
    private final Clock clock;

    @Scheduled(cron = "0 * * * * *")
    @Transactional
    public void runOnce() {
        LocalDate today = LocalDate.now(clock);
        Instant now = Instant.now(clock);
        List<Campaign> candidates = campaignRepository.findByStatusIn(CampaignLifecycle.SCHEDULED);
        int changed = 0;
        for (Campaign campaign : candidates) {
            var transition = CampaignLifecycle.scheduledTransition(campaign, today);
            if (transition.isEmpty()) {
                continue;
            }
            CampaignStatus target = transition.get().target();
            campaign.setStatus(target);
            if (target == CampaignStatus.ACTIVE) {
                campaign.setActivatedAt(now);
            } else {
                campaign.setTerminatedAt(now);
                campaign.setTerminationReason(transition.get().reason());
            }
            campaignRepository.save(campaign);
            changed++;
        }
        if (changed > 0) {
            log.info("Cycle de vie des campagnes : {} transition(s) appliquée(s)", changed);
        }
    }
}
