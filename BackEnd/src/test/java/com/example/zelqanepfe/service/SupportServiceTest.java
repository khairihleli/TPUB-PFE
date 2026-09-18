package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.SupportAvailabilitySlot;
import com.example.zelqanepfe.dto.SupportRequest;
import com.example.zelqanepfe.dto.SupportResponse;
import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.AvailabilityStatus;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.PorteurType;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.model.SupportAvailability;
import com.example.zelqanepfe.model.SupportType;
import com.example.zelqanepfe.model.TechnicalStatus;
import com.example.zelqanepfe.model.Zone;
import com.example.zelqanepfe.repository.DiffusionSupportRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.repository.SupportAvailabilityRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.ZoneId;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SupportServiceTest {

    private static ValidatorFactory validatorFactory;
    private static Validator validator;

    private DiffusionSupportRepository supportRepository;
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);
    private static final Clock CLOCK = Clock.fixed(TODAY.atTime(10, 0).atZone(ZoneId.of("Africa/Tunis")).toInstant(),
            ZoneId.of("Africa/Tunis"));

    private ReservationRepository reservationRepository;
    private SupportAvailabilityRepository blockRepository;
    private ZoneService zoneService;
    private SupportService service;
    private Zone zone;

    @BeforeAll
    static void initValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    @BeforeEach
    void setUp() {
        supportRepository = mock(DiffusionSupportRepository.class);
        reservationRepository = mock(ReservationRepository.class);
        zoneService = mock(ZoneService.class);
        blockRepository = mock(SupportAvailabilityRepository.class);
        service = new SupportService(supportRepository, reservationRepository, blockRepository, zoneService,
                mock(AuditService.class), CLOCK);
        zone = new Zone();
        zone.setId(1L);
        zone.setName("Tunis Centre");
        when(zoneService.findZone(1L)).thenReturn(zone);
        when(supportRepository.save(any(DiffusionSupport.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private SupportRequest.SupportRequestBuilder baseRequest() {
        return SupportRequest.builder()
                .zoneId(1L)
                .name("Écran LED Avenue Habib Bourguiba")
                .supportType(SupportType.ECRAN)
                .latitude(new BigDecimal("36.7998"))
                .longitude(new BigDecimal("10.1817"));
    }

    private DiffusionSupport existingSupport() {
        return DiffusionSupport.builder()
                .id(7L)
                .zone(zone)
                .name("Écran LED Avenue Habib Bourguiba")
                .supportType(SupportType.ECRAN)
                .latitude(new BigDecimal("36.7998"))
                .longitude(new BigDecimal("10.1817"))
                .technicalStatus(TechnicalStatus.ACTIF)
                .porteurType(PorteurType.A)
                .mastHeightM((short) 25)
                .headingDeg((short) 45)
                .address("Avenue Habib Bourguiba, Tunis")
                .build();
    }

    @Test
    void updateKeepsPorteurFieldsWhenRequestFieldsAreNull() {
        when(supportRepository.findById(7L)).thenReturn(Optional.of(existingSupport()));

        SupportResponse response = service.update(7L, baseRequest().build());

        assertThat(response.getPorteurType()).isEqualTo("A");
        assertThat(response.getMastHeightM()).isEqualTo((short) 25);
        assertThat(response.getHeadingDeg()).isEqualTo((short) 45);
        assertThat(response.getAddress()).isEqualTo("Avenue Habib Bourguiba, Tunis");
    }

    @Test
    void updateAppliesProvidedPorteurFieldsAndBlankAddressClears() {
        when(supportRepository.findById(7L)).thenReturn(Optional.of(existingSupport()));

        SupportResponse response = service.update(7L, baseRequest()
                .porteurType("B").mastHeightM(30).headingDeg(270).address("   ").build());

        assertThat(response.getPorteurType()).isEqualTo("B");
        assertThat(response.getMastHeightM()).isEqualTo((short) 30);
        assertThat(response.getHeadingDeg()).isEqualTo((short) 270);
        assertThat(response.getAddress()).isNull();
    }

    @Test
    void createLeavesPorteurFieldsNullWhenOmitted() {
        SupportResponse response = service.create(baseRequest().build());

        assertThat(response.getPorteurType()).isNull();
        assertThat(response.getMastHeightM()).isNull();
        assertThat(response.getHeadingDeg()).isNull();
        assertThat(response.getAddress()).isNull();
    }

    @Test
    void availabilityDefaultsToTodayPlus90Days() {
        LocalDate today = TODAY;
        Reservation reservation = Reservation.builder()
                .support(existingSupport())
                .startDate(today.plusDays(3))
                .endDate(today.plusDays(10))
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(21, 0))
                .reservationStatus(ReservationStatus.CONFIRMEE)
                .build();
        when(supportRepository.existsById(7L)).thenReturn(true);
        when(reservationRepository.findBookedPeriodsForSupport(
                eq(7L), eq(today), eq(today.plusDays(90)),
                eq(List.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE))))
                .thenReturn(List.of(reservation));

        List<SupportAvailabilitySlot> slots = service.getAvailability(7L, null, null, null, null);

        assertThat(slots).singleElement().satisfies(slot -> {
            assertThat(slot.getStartDate()).isEqualTo(today.plusDays(3));
            assertThat(slot.getEndDate()).isEqualTo(today.plusDays(10));
            assertThat(slot.getStartTime()).isEqualTo(LocalTime.of(9, 0));
            assertThat(slot.getReservationStatus()).isEqualTo("CONFIRMEE");
        });
    }

    @Test
    void availabilityRejectsUnknownSupportAndInvertedRange() {
        when(supportRepository.existsById(99L)).thenReturn(false);
        assertThatThrownBy(() -> service.getAvailability(99L, null, null, null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUPPORT_NOT_FOUND");

        when(supportRepository.existsById(7L)).thenReturn(true);
        LocalDate from = LocalDate.of(2026, 10, 10);
        assertThatThrownBy(() -> service.getAvailability(7L, from, from.minusDays(1), null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_RANGE");
        verify(reservationRepository, never()).findBookedPeriodsForSupport(any(), any(), any(), any());
    }

    @Test
    void requestValidationRejectsDisallowedPorteurValues() {
        SupportRequest invalid = baseRequest().porteurType("E").mastHeightM(18).headingDeg(360).build();
        Set<String> invalidFields = validator.validate(invalid).stream()
                .map(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .collect(Collectors.toSet());
        assertThat(invalidFields).containsExactlyInAnyOrder("porteurType", "mastHeightM", "headingDeg");

        SupportRequest valid = baseRequest().porteurType("D").mastHeightM(15).headingDeg(0).build();
        assertThat(validator.validate(valid)).isEmpty();
    }

    @Test
    void availabilityMergesBlocksAndFiltersByTimeOfDay() {
        DiffusionSupport support = existingSupport();
        Reservation morning = Reservation.builder().support(support).startDate(TODAY.plusDays(1)).endDate(TODAY.plusDays(2))
                .startTime(LocalTime.of(7, 0)).endTime(LocalTime.of(12, 0)).reservationStatus(ReservationStatus.TEMPORAIRE).build();
        Reservation evening = Reservation.builder().support(support).startDate(TODAY.plusDays(1)).endDate(TODAY.plusDays(2))
                .startTime(LocalTime.of(18, 0)).endTime(LocalTime.of(23, 0)).reservationStatus(ReservationStatus.CONFIRMEE).build();
        SupportAvailability maintenance = SupportAvailability.builder().support(support).availabilityDate(TODAY)
                .startTime(LocalTime.of(19, 0)).endTime(LocalTime.of(20, 0))
                .availabilityStatus(AvailabilityStatus.MAINTENANCE).reason("Remplacement dalle").build();
        SupportAvailability legacy = SupportAvailability.builder().support(support).availabilityDate(TODAY)
                .startTime(LocalTime.of(19, 0)).endTime(LocalTime.of(20, 0)).availabilityStatus(AvailabilityStatus.DISPONIBLE).build();
        when(supportRepository.existsById(7L)).thenReturn(true);
        when(reservationRepository.findBookedPeriodsForSupport(eq(7L), any(), any(), any())).thenReturn(List.of(morning, evening));
        when(blockRepository.findBySupportIdAndAvailabilityDateBetweenOrderByAvailabilityDateAscStartTimeAsc(eq(7L), any(), any()))
                .thenReturn(List.of(maintenance, legacy));

        List<SupportAvailabilitySlot> evenings = service.getAvailability(7L, null, null, LocalTime.of(18, 0), LocalTime.of(23, 0));

        assertThat(evenings).extracting(SupportAvailabilitySlot::getKind).containsExactly("BLOCAGE", "RESERVATION");
        assertThat(evenings.get(0).getAvailabilityStatus()).isEqualTo("MAINTENANCE");
        assertThat(evenings.get(0).getReservationStatus()).isNull();
        assertThat(evenings.get(0).getReason()).isEqualTo("Remplacement dalle");
        assertThat(evenings.get(1).getReservationStatus()).isEqualTo("CONFIRMEE");
        assertThat(service.getAvailability(7L, null, null, null, null)).hasSize(3);
        assertThatThrownBy(() -> service.getAvailability(7L, null, null, LocalTime.of(20, 0), LocalTime.of(8, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_TIME_RANGE");
    }

    @Test
    void visibilityScoreIsStoredValidatedAndSupportsAreFiltered() {
        SupportResponse created = service.create(baseRequest().visibilityScore(new BigDecimal("80")).build());
        assertThat(created.getVisibilityScore()).isEqualByComparingTo("80");
        assertThat(created.getDistanceKm()).isNull();

        Set<String> invalid = validator.validate(baseRequest().visibilityScore(new BigDecimal("101")).build()).stream()
                .map(v -> v.getPropertyPath().toString()).collect(Collectors.toSet());
        assertThat(invalid).containsExactly("visibilityScore");

        DiffusionSupport screen = existingSupport();
        DiffusionSupport wifi = existingSupport();
        wifi.setId(8L);
        wifi.setName("Borne Wi-Fi");
        wifi.setSupportType(SupportType.POINT_WIFI);
        wifi.setTechnicalStatus(TechnicalStatus.MAINTENANCE);
        when(supportRepository.findAll()).thenReturn(List.of(screen, wifi));
        assertThat(service.getAll(List.of(1L), List.of(SupportType.POINT_WIFI), List.of()))
                .extracting(SupportResponse::getId).containsExactly(8L);
        assertThat(service.getAll(List.of(), List.of(), List.of(TechnicalStatus.ACTIF)))
                .extracting(SupportResponse::getId).containsExactly(7L);
        assertThat(service.getAll(List.of(2L), List.of(), List.of())).isEmpty();
    }
}
