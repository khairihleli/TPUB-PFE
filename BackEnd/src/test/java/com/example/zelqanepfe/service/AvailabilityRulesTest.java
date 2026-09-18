package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AvailabilityResponse;
import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignZone;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AvailabilityRulesTest {

    private static final LocalDate D = LocalDate.of(2026, 10, 5);
    private static final TimeWindow EVENING = new TimeWindow(D, D.plusDays(2), LocalTime.of(18, 0), LocalTime.of(23, 0));

    private static DiffusionSupport support(TechnicalStatus status, int capacity) {
        return DiffusionSupport.builder().id(1L).name("P").supportType(SupportType.ECRAN)
                .latitude(new BigDecimal("36.8")).longitude(new BigDecimal("10.18"))
                .technicalStatus(status).diffusionCapacity((short) capacity).build();
    }

    private static Reservation reservation(long id, long campaignId, ReservationStatus status, LocalDate start, LocalDate end,
                                           int fromHour, int toHour) {
        return Reservation.builder().id(id).campaign(Campaign.builder().id(campaignId).build())
                .startDate(start).endDate(end).startTime(LocalTime.of(fromHour, 0)).endTime(LocalTime.of(toHour, 0))
                .reservationStatus(status).build();
    }

    private static SupportAvailability block(LocalDate day, int fromHour, int toHour, AvailabilityStatus status) {
        return SupportAvailability.builder().availabilityDate(day).startTime(LocalTime.of(fromHour, 0))
                .endTime(LocalTime.of(toHour, 0)).availabilityStatus(status).build();
    }

    @Test
    void technicalStatusComesFirst() {
        assertThat(AvailabilityRules.derive(support(TechnicalStatus.INACTIF, 1), EVENING, List.of(), List.of(), null).status())
                .isEqualTo(AvailabilityStatus.HORS_LIGNE);
        assertThat(AvailabilityRules.derive(support(TechnicalStatus.HORS_LIGNE, 1), EVENING, List.of(), List.of(), null).status())
                .isEqualTo(AvailabilityStatus.HORS_LIGNE);
        AvailabilityRules.Result maintenance = AvailabilityRules.derive(support(TechnicalStatus.MAINTENANCE, 3), EVENING,
                List.of(), List.of(), null);
        assertThat(maintenance.status()).isEqualTo(AvailabilityStatus.MAINTENANCE);
        assertThat(maintenance.remainingCapacity()).isZero();
    }

    @Test
    void blocksApplyOnlyWhenTheyOverlapTheWindow() {
        DiffusionSupport s = support(TechnicalStatus.ACTIF, 1);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(),
                List.of(block(D.plusDays(1), 8, 12, AvailabilityStatus.HORS_LIGNE)), null).status())
                .isEqualTo(AvailabilityStatus.DISPONIBLE);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(),
                List.of(block(D.plusDays(3), 19, 20, AvailabilityStatus.HORS_LIGNE)), null).status())
                .isEqualTo(AvailabilityStatus.DISPONIBLE);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(),
                List.of(block(D.plusDays(1), 22, 23, AvailabilityStatus.MAINTENANCE),
                        block(D, 19, 20, AvailabilityStatus.HORS_LIGNE)), null).status())
                .isEqualTo(AvailabilityStatus.HORS_LIGNE);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(),
                List.of(block(D.plusDays(2), 17, 19, AvailabilityStatus.OCCUPE)), null).status())
                .isEqualTo(AvailabilityStatus.OCCUPE);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(),
                List.of(block(D, 18, 23, AvailabilityStatus.DISPONIBLE)), null).status())
                .isEqualTo(AvailabilityStatus.DISPONIBLE);
    }

    @Test
    void reservationsCountOnlyWhenDatesAndTimesOverlap() {
        DiffusionSupport s = support(TechnicalStatus.ACTIF, 1);
        Reservation morningSameDays = reservation(1, 10, ReservationStatus.CONFIRMEE, D, D.plusDays(2), 7, 12);
        Reservation eveningOtherWeek = reservation(2, 11, ReservationStatus.CONFIRMEE, D.plusDays(7), D.plusDays(9), 18, 23);
        Reservation cancelled = reservation(3, 12, ReservationStatus.ANNULEE, D, D.plusDays(2), 18, 23);
        Reservation adjacent = reservation(4, 13, ReservationStatus.TEMPORAIRE, D, D, 12, 18);
        AvailabilityRules.Result result = AvailabilityRules.derive(s, EVENING,
                List.of(morningSameDays, eveningOtherWeek, cancelled, adjacent), List.of(), null);
        assertThat(result.status()).isEqualTo(AvailabilityStatus.DISPONIBLE);
        assertThat(result.remainingCapacity()).isEqualTo(1);
        assertThat(result.overlapping()).isEmpty();
    }

    @Test
    void capacityDecidesBetweenAvailableReservedAndOccupied() {
        DiffusionSupport twoSlots = support(TechnicalStatus.ACTIF, 2);
        Reservation temporary = reservation(1, 10, ReservationStatus.TEMPORAIRE, D.plusDays(1), D.plusDays(5), 20, 22);
        Reservation temporary2 = reservation(2, 11, ReservationStatus.TEMPORAIRE, D.minusDays(3), D, 17, 19);
        Reservation confirmed = reservation(3, 12, ReservationStatus.CONFIRMEE, D, D, 22, 23);

        AvailabilityRules.Result one = AvailabilityRules.derive(twoSlots, EVENING, List.of(temporary), List.of(), null);
        assertThat(one.status()).isEqualTo(AvailabilityStatus.DISPONIBLE);
        assertThat(one.remainingCapacity()).isEqualTo(1);

        assertThat(AvailabilityRules.derive(twoSlots, EVENING, List.of(temporary, temporary2), List.of(), null).status())
                .isEqualTo(AvailabilityStatus.RESERVE);
        assertThat(AvailabilityRules.derive(twoSlots, EVENING, List.of(temporary, confirmed), List.of(), null).status())
                .isEqualTo(AvailabilityStatus.OCCUPE);
    }

    @Test
    void ownCampaignReservationsAreIgnored() {
        DiffusionSupport s = support(TechnicalStatus.ACTIF, 1);
        Reservation own = reservation(1, 10, ReservationStatus.TEMPORAIRE, D, D, 18, 23);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(own), List.of(), 10L).status())
                .isEqualTo(AvailabilityStatus.DISPONIBLE);
        assertThat(AvailabilityRules.derive(s, EVENING, List.of(own), List.of(), 99L).status())
                .isEqualTo(AvailabilityStatus.RESERVE);
    }

    @Test
    void presetsMatchTheSharedTable() {
        assertThat(AvailabilityRules.Preset.of(LocalTime.of(7, 0), LocalTime.of(12, 0))).isEqualTo(AvailabilityRules.Preset.MATIN);
        assertThat(AvailabilityRules.Preset.of(LocalTime.of(12, 0), LocalTime.of(18, 0))).isEqualTo(AvailabilityRules.Preset.APRES_MIDI);
        assertThat(AvailabilityRules.Preset.of(LocalTime.of(18, 0), LocalTime.of(23, 0))).isEqualTo(AvailabilityRules.Preset.SOIR);
        assertThat(AvailabilityRules.Preset.of(LocalTime.of(7, 0), LocalTime.of(23, 0))).isEqualTo(AvailabilityRules.Preset.JOURNEE);
        assertThat(AvailabilityRules.Preset.of(LocalTime.of(9, 0), LocalTime.of(17, 0))).isNull();
    }

    @Test
    void alternativesKeepTopThreeByAvailabilityThenEarliestStart() {
        AvailabilityResponse.AlternativeSlot none = alt(D, 7, 0);
        AvailabilityResponse.AlternativeSlot laterTwo = alt(D.plusDays(7), 18, 2);
        AvailabilityResponse.AlternativeSlot earlierTwo = alt(D, 12, 2);
        AvailabilityResponse.AlternativeSlot three = alt(D.plusDays(28), 18, 3);
        AvailabilityResponse.AlternativeSlot one = alt(D, 7, 1);
        assertThat(AvailabilityService.rankAlternatives(List.of(none, laterTwo, earlierTwo, three, one)))
                .containsExactly(three, earlierTwo, laterTwo);
    }

    @Test
    void windowValidationAndCircleCandidates() {
        assertThatThrownBy(() -> AvailabilityService.validateWindow(D, D.minusDays(1), LocalTime.NOON, LocalTime.MIDNIGHT.minusHours(1)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");
        assertThatThrownBy(() -> AvailabilityService.validateWindow(D, D.plusDays(366), LocalTime.of(8, 0), LocalTime.of(9, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");
        assertThatThrownBy(() -> AvailabilityService.validateWindow(D, D, LocalTime.of(9, 0), LocalTime.of(9, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_TIME_RANGE");
        assertThatThrownBy(() -> AvailabilityService.validateWindow(D, D, null, LocalTime.of(9, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MISSING_PARAMETER");
        assertThat(AvailabilityService.validateWindow(D, D.plusDays(365), LocalTime.of(8, 0), LocalTime.of(9, 0)).days())
                .isEqualTo(366);

        DiffusionSupport near = support(TechnicalStatus.ACTIF, 1);
        DiffusionSupport far = DiffusionSupport.builder().id(2L).name("Far").supportType(SupportType.ECRAN)
                .latitude(new BigDecimal("36.9")).longitude(new BigDecimal("10.30")).build();
        CampaignZone circle = CampaignZone.builder().latitude(new BigDecimal("36.801")).longitude(new BigDecimal("10.18"))
                .radiusKm(new BigDecimal("1.0")).build();
        List<AvailabilityService.Candidate> candidates = AvailabilityService.inCircles(List.of(near, far), List.of(circle));
        assertThat(candidates).singleElement().satisfies(c -> {
            assertThat(c.support().getId()).isEqualTo(1L);
            assertThat(c.distanceKm()).isBetween(0.1, 0.12);
        });
    }

    private static AvailabilityResponse.AlternativeSlot alt(LocalDate start, int hour, long available) {
        return AvailabilityResponse.AlternativeSlot.builder().startDate(start).endDate(start.plusDays(2))
                .startTime(LocalTime.of(hour, 0)).endTime(LocalTime.of(hour + 4, 0)).availableSupports(available).build();
    }
}
