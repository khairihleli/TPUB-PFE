package com.example.zelqanepfe.service;

import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.TechnicalStatus;

import java.time.LocalTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Availability status derivation for one support and one window (contract §2.7). Pure, no I/O.
 */
public final class AvailabilityRules {

    /** Reservation statuses that hold capacity. */
    public static final Set<ReservationStatus> LIVE = Set.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);

    /** Block statuses that make a support unavailable (a legacy DISPONIBLE/RESERVE row is not a block). */
    public static final Set<AvailabilityStatus> BLOCKING = Set.of(
            AvailabilityStatus.MAINTENANCE, AvailabilityStatus.HORS_LIGNE, AvailabilityStatus.OCCUPE);

    /** Slot presets shared with the frontend ({@code src/lib/time-slots.ts}). */
    public enum Preset {
        MATIN(LocalTime.of(7, 0), LocalTime.of(12, 0)),
        APRES_MIDI(LocalTime.of(12, 0), LocalTime.of(18, 0)),
        SOIR(LocalTime.of(18, 0), LocalTime.of(23, 0)),
        JOURNEE(LocalTime.of(7, 0), LocalTime.of(23, 0));

        public final LocalTime start;
        public final LocalTime end;

        Preset(LocalTime start, LocalTime end) {
            this.start = start;
            this.end = end;
        }

        public static Preset of(LocalTime start, LocalTime end) {
            for (Preset preset : values()) {
                if (preset.start.equals(start) && preset.end.equals(end)) {
                    return preset;
                }
            }
            return null;
        }
    }

    /**
     * @param status            derived status
     * @param remainingCapacity capacity − N (never negative)
     * @param overlapping       overlapping live reservations of other campaigns (N = size)
     * @param blocks            overlapping blocking rows
     */
    public record Result(AvailabilityStatus status, int remainingCapacity, List<Reservation> overlapping,
                         List<SupportAvailability> blocks) {
    }

    private AvailabilityRules() {
    }

    /**
     * @param reservations candidate reservations on this support (any status, filtered here)
     * @param blocks       candidate blocks on this support (filtered here)
     * @param campaignId   reservations of this campaign are not counted (null: count all)
     */
    public static Result derive(DiffusionSupport support, TimeWindow window, List<Reservation> reservations,
                                List<SupportAvailability> blocks, Long campaignId) {
        List<SupportAvailability> overlappingBlocks = blocks.stream()
                .filter(b -> BLOCKING.contains(b.getAvailabilityStatus()))
                .filter(window::overlaps)
                .toList();
        List<Reservation> others = reservations.stream()
                .filter(r -> LIVE.contains(r.getReservationStatus()))
                .filter(r -> campaignId == null || r.getCampaign() == null
                        || !Objects.equals(r.getCampaign().getId(), campaignId))
                .filter(window::overlaps)
                .toList();
        int capacity = Math.max(1, support.getDiffusionCapacity() == null ? 1 : support.getDiffusionCapacity());
        int remaining = Math.max(0, capacity - others.size());

        TechnicalStatus technical = support.getTechnicalStatus();
        AvailabilityStatus status;
        if (technical == TechnicalStatus.HORS_LIGNE || technical == TechnicalStatus.INACTIF
                || hasBlock(overlappingBlocks, AvailabilityStatus.HORS_LIGNE)) {
            status = AvailabilityStatus.HORS_LIGNE;
        } else if (technical == TechnicalStatus.MAINTENANCE || hasBlock(overlappingBlocks, AvailabilityStatus.MAINTENANCE)) {
            status = AvailabilityStatus.MAINTENANCE;
        } else if (hasBlock(overlappingBlocks, AvailabilityStatus.OCCUPE)
                || (others.size() >= capacity
                && others.stream().anyMatch(r -> r.getReservationStatus() == ReservationStatus.CONFIRMEE))) {
            status = AvailabilityStatus.OCCUPE;
        } else if (others.size() >= capacity) {
            status = AvailabilityStatus.RESERVE;
        } else {
            status = AvailabilityStatus.DISPONIBLE;
        }
        if (status != AvailabilityStatus.DISPONIBLE) {
            remaining = 0;
        }
        return new Result(status, remaining, others, overlappingBlocks);
    }

    private static boolean hasBlock(List<SupportAvailability> blocks, AvailabilityStatus status) {
        return blocks.stream().anyMatch(b -> b.getAvailabilityStatus() == status);
    }
}
