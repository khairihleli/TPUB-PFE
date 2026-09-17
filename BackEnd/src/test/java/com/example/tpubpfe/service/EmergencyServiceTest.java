package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.EmergencyRequest;
import com.example.tpubpfe.dto.EmergencyResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.EmergencyStopReason;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EmergencyServiceTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 16);
    private static final LocalDateTime NOW = TODAY.atTime(10, 0);

    private final Zone centre = Zone.builder().id(1L).name("Tunis Centre").latitude(new BigDecimal("36.8000"))
            .longitude(new BigDecimal("10.1800")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private final Zone marsa = Zone.builder().id(2L).name("La Marsa").latitude(new BigDecimal("36.8780"))
            .longitude(new BigDecimal("10.3240")).radiusKm(new BigDecimal("3")).isActive(true).build();
    private EmergencyMessageRepository repository;
    private DiffusionSupportRepository supportRepository;
    private EmergencyService service;

    @BeforeEach
    void setUp() {
        repository = mock(EmergencyMessageRepository.class);
        supportRepository = mock(DiffusionSupportRepository.class);
        ZoneRepository zoneRepository = mock(ZoneRepository.class);
        ZoneService zoneService = mock(ZoneService.class);
        UserRepository userRepository = mock(UserRepository.class);
        service = new EmergencyService(repository, zoneService, zoneRepository, userRepository, supportRepository,
                mock(DiffusionLogRepository.class), mock(AuditService.class),
                Clock.fixed(NOW.atZone(TUNIS).toInstant(), TUNIS));
        when(zoneRepository.findByIsActiveTrue()).thenReturn(List.of(centre, marsa));
        when(zoneService.findZone(1L)).thenReturn(centre);
        when(userRepository.findById(1L)).thenReturn(Optional.of(User.builder().id(1L).nom("Admin TPUB").build()));
        when(repository.save(any(EmergencyMessage.class))).thenAnswer(inv -> inv.getArgument(0));
        when(supportRepository.findAll()).thenReturn(List.of(
                support(1L, "36.8790", "10.3230", TechnicalStatus.ACTIF, marsa),
                support(2L, "36.8795", "10.3235", TechnicalStatus.MAINTENANCE, marsa),
                support(3L, "36.8000", "10.1800", TechnicalStatus.ACTIF, centre)));
        TestAuth.login(1L, "ADMINISTRATEUR");
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    private static DiffusionSupport support(long id, String lat, String lng, TechnicalStatus status, Zone zone) {
        return DiffusionSupport.builder().id(id).name("P" + id).zone(zone).supportType(SupportType.ECRAN)
                .latitude(new BigDecimal(lat)).longitude(new BigDecimal(lng)).technicalStatus(status).build();
    }

    private static EmergencyRequest.EmergencyRequestBuilder request() {
        return EmergencyRequest.builder().title("Route fermée").content("Déviation par l'avenue de France")
                .startDate(TODAY).endDate(TODAY);
    }

    @Test
    void circleWithoutZoneResolvesZoneAndAppliesDefaults() {
        EmergencyResponse response = service.create(request().latitude(new BigDecimal("36.8785"))
                .longitude(new BigDecimal("10.3235")).radiusKm(new BigDecimal("0.5")).build());

        assertThat(response.getZoneId()).isEqualTo(2L);
        assertThat(response.getStartTime()).isEqualTo(LocalTime.MIDNIGHT);
        assertThat(response.getEndTime()).isEqualTo(LocalTime.of(23, 59, 59));
        assertThat(response.getDurationSeconds()).isEqualTo(15);
        assertThat(response.getPriority()).isEqualTo((short) 1);
        assertThat(response.getUrgencyLevel()).isEqualTo("HIGH");
        assertThat(response.getState()).isEqualTo("EN_COURS");
        assertThat(response.getAffectedSupports()).isEqualTo(1);
        assertThat(response.getCreatedByName()).isEqualTo("Admin TPUB");
    }

    @Test
    void zoneTargetCountsActiveSupportsOfTheZone() {
        EmergencyResponse response = service.create(request().zoneId(1L).startTime(LocalTime.of(11, 0))
                .endTime(LocalTime.of(12, 0)).urgencyLevel(UrgencyLevel.CRITICAL).durationSeconds(40).build());
        assertThat(response.getAffectedSupports()).isEqualTo(1);
        assertThat(response.getState()).isEqualTo("PROGRAMME");
        assertThat(response.getLatitude()).isNull();
    }

    @Test
    void createValidation() {
        assertThatThrownBy(() -> service.create(request().build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).latitude(new BigDecimal("36.8")).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EMERGENCY_TARGET_REQUIRED");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).startTime(LocalTime.of(8, 0)).endTime(LocalTime.of(9, 0)).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_EMERGENCY_WINDOW");
        assertThatThrownBy(() -> service.create(request().zoneId(1L).startTime(LocalTime.of(12, 0)).endTime(LocalTime.of(11, 0)).build()))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_EMERGENCY_WINDOW");
    }

    @Test
    void stateDerivation() {
        EmergencyMessage message = EmergencyMessage.builder().isActive(true).startDate(TODAY).endDate(TODAY)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(11, 0)).build();
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.EN_COURS);
        assertThat(EmergencyService.state(message, TODAY.atTime(8, 59))).isEqualTo(EmergencyService.State.PROGRAMME);
        assertThat(EmergencyService.state(message, TODAY.atTime(11, 0, 1))).isEqualTo(EmergencyService.State.TERMINE);
        message.setIsActive(false);
        message.setStopReason(EmergencyStopReason.MANUEL);
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.DESACTIVE);
        message.setStopReason(EmergencyStopReason.AUTO);
        assertThat(EmergencyService.state(message, NOW)).isEqualTo(EmergencyService.State.TERMINE);
    }

    @Test
    void deactivateRecordsManualStop() {
        EmergencyMessage message = EmergencyMessage.builder().id(9L).title("T").content("C").zone(centre).isActive(true)
                .startDate(TODAY).endDate(TODAY).urgencyLevel(UrgencyLevel.LOW).priority((short) 1).build();
        when(repository.findById(9L)).thenReturn(Optional.of(message));
        EmergencyResponse response = service.deactivate(9L);
        assertThat(response.getIsActive()).isFalse();
        assertThat(response.getStopReason()).isEqualTo("MANUEL");
        assertThat(response.getState()).isEqualTo("DESACTIVE");
        assertThat(response.getStoppedAt()).isNotNull();

        assertThatThrownBy(() -> service.getAll("inconnu"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_PARAMETER");
    }
}
