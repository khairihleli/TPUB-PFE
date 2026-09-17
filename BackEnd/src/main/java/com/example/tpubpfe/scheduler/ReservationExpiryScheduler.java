package com.example.tpubpfe.scheduler;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.service.CampaignReservationSync;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Expires temporary reservations (contract §2.4): TEMPORAIRE → EXPIREE when the period is over, or when the campaign
 * is still BROUILLON | REJECTED_BY_AI after {@code tpub.reservation.temporary-ttl-hours}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationExpiryScheduler {

    private static final Set<CampaignStatus> UNSUBMITTED = Set.of(CampaignStatus.BROUILLON, CampaignStatus.REJECTED_BY_AI);

    private final ReservationRepository reservationRepository;
    private final CampaignReservationSync reservationSync;
    private final TpubProperties properties;
    private final Clock clock;

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public void runOnce() {
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.now(clock);
        Instant ttlLimit = now.minus(Duration.ofHours(properties.getReservation().getTemporaryTtlHours()));
        List<Reservation> expired = new ArrayList<>();
        Map<Long, Campaign> campaigns = new LinkedHashMap<>();
        for (Reservation reservation : reservationRepository.findByReservationStatus(ReservationStatus.TEMPORAIRE)) {
            if (shouldExpire(reservation, today, ttlLimit)) {
                reservation.setReservationStatus(ReservationStatus.EXPIREE);
                reservation.setExpiredAt(now);
                expired.add(reservation);
                campaigns.putIfAbsent(reservation.getCampaign().getId(), reservation.getCampaign());
            }
        }
        if (expired.isEmpty()) {
            return;
        }
        reservationRepository.saveAll(expired);
        campaigns.values().forEach(reservationSync::recomputeEstimatedViews);
        log.info("Réservations temporaires expirées : {} (campagnes concernées : {})", expired.size(), campaigns.size());
    }

    static boolean shouldExpire(Reservation reservation, LocalDate today, Instant ttlLimit) {
        if (reservation.getReservationStatus() != ReservationStatus.TEMPORAIRE) {
            return false;
        }
        if (reservation.getEndDate().isBefore(today)) {
            return true;
        }
        Campaign campaign = reservation.getCampaign();
        return campaign != null && UNSUBMITTED.contains(campaign.getStatus())
                && reservation.getCreatedAt() != null && reservation.getCreatedAt().isBefore(ttlLimit);
    }
}
