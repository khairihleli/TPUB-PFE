package com.example.tpubpfe.service;

import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Reservation status writes that belong to the campaign lifecycle (contract §2.1): cancellations after an edit,
 * a zone change or a rejection, confirmation on validation, and {@code campaign.estimatedViews} recomputation.
 * Only existing {@link ReservationRepository} methods are used.
 */
@Component
@RequiredArgsConstructor
public class CampaignReservationSync {

    static final Set<ReservationStatus> LIVE = Set.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);

    private final ReservationRepository reservationRepository;
    private final CampaignRepository campaignRepository;

    public List<Reservation> reservations(Campaign campaign) {
        return reservationRepository.findByCampaignId(campaign.getId());
    }

    /** Cancels the reservations in one of {@code statuses} matching {@code shouldCancel}; returns their ids. */
    public List<Long> cancel(Campaign campaign, Set<ReservationStatus> statuses, Predicate<Reservation> shouldCancel) {
        List<Reservation> changed = new ArrayList<>();
        for (Reservation reservation : reservations(campaign)) {
            if (statuses.contains(reservation.getReservationStatus()) && shouldCancel.test(reservation)) {
                reservation.setReservationStatus(ReservationStatus.ANNULEE);
                changed.add(reservation);
            }
        }
        if (!changed.isEmpty()) {
            reservationRepository.saveAll(changed);
        }
        return changed.stream().map(Reservation::getId).toList();
    }

    /** TEMPORAIRE reservations with endDate ≥ today become CONFIRMEE; returns every CONFIRMEE reservation. */
    public List<Reservation> confirmLiveTemporary(Campaign campaign, LocalDate today) {
        List<Reservation> all = reservations(campaign);
        List<Reservation> changed = new ArrayList<>();
        for (Reservation reservation : all) {
            if (reservation.getReservationStatus() == ReservationStatus.TEMPORAIRE
                    && !reservation.getEndDate().isBefore(today)) {
                reservation.setReservationStatus(ReservationStatus.CONFIRMEE);
                changed.add(reservation);
            }
        }
        if (!changed.isEmpty()) {
            reservationRepository.saveAll(changed);
        }
        return all.stream().filter(r -> r.getReservationStatus() == ReservationStatus.CONFIRMEE).toList();
    }

    public boolean hasLiveTemporary(Campaign campaign, LocalDate today) {
        return reservations(campaign).stream()
                .anyMatch(r -> r.getReservationStatus() == ReservationStatus.TEMPORAIRE && !r.getEndDate().isBefore(today));
    }

    /** {@code estimatedViews = Σ estimatedViews} of TEMPORAIRE | CONFIRMEE reservations. */
    public void recomputeEstimatedViews(Campaign campaign) {
        long views = reservations(campaign).stream()
                .filter(r -> LIVE.contains(r.getReservationStatus()))
                .mapToLong(r -> r.getEstimatedViews() == null ? 0L : r.getEstimatedViews())
                .sum();
        campaign.setEstimatedViews(views);
        campaignRepository.save(campaign);
    }

    /** A reservation window inside the campaign period and time slot (null bounds are open). */
    public static boolean insideCampaignWindow(Reservation reservation, Campaign campaign) {
        LocalDate start = campaign.getStartDate();
        LocalDate end = campaign.getEndDate();
        LocalTime startTime = campaign.getStartTime();
        LocalTime endTime = campaign.getEndTime();
        return (start == null || !reservation.getStartDate().isBefore(start))
                && (end == null || !reservation.getEndDate().isAfter(end))
                && (startTime == null || !reservation.getStartTime().isBefore(startTime))
                && (endTime == null || !reservation.getEndTime().isAfter(endTime));
    }
}
