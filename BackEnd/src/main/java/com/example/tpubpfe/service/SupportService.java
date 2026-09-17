package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.SupportAvailabilitySlot;
import com.example.tpubpfe.dto.SupportRequest;
import com.example.tpubpfe.dto.SupportResponse;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.PorteurType;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportAvailability;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.SupportAvailabilityRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SupportService {

    /** Default availability window when {@code to} is omitted: {@code from} + 90 days. */
    static final int DEFAULT_AVAILABILITY_DAYS = 90;

    private static final List<ReservationStatus> BLOCKING_STATUSES =
            List.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);

    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final SupportAvailabilityRepository blockRepository;
    private final ZoneService zoneService;
    private final AuditService auditService;
    private final Clock clock;

    @Transactional
    public SupportResponse create(SupportRequest request) {
        DiffusionSupport support = DiffusionSupport.builder()
                .zone(zoneService.findZone(request.getZoneId()))
                .name(request.getName())
                .supportType(request.getSupportType())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .technicalStatus(request.getTechnicalStatus() != null
                        ? request.getTechnicalStatus() : TechnicalStatus.ACTIF)
                .diffusionCapacity(request.getDiffusionCapacity() != null
                        ? request.getDiffusionCapacity() : (short) 1)
                .visibilityScore(request.getVisibilityScore())
                .build();
        applyPorteurFields(support, request);
        DiffusionSupport saved = supportRepository.save(support);
        auditService.record("SUPPORT_CREATED", "SUPPORT", saved.getId(),
                "Création du Porteur « " + saved.getName() + " »", details(saved));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getAll() {
        return getAll(List.of(), List.of(), List.of());
    }

    /** All supports, optionally filtered (empty list = no filter), sorted by name. */
    @Transactional(readOnly = true)
    public List<SupportResponse> getAll(List<Long> zoneIds, List<SupportType> supportTypes,
                                        List<TechnicalStatus> technicalStatuses) {
        return supportRepository.findAll().stream()
                .filter(s -> zoneIds == null || zoneIds.isEmpty() || zoneIds.contains(s.getZone().getId()))
                .filter(s -> supportTypes == null || supportTypes.isEmpty() || supportTypes.contains(s.getSupportType()))
                .filter(s -> technicalStatuses == null || technicalStatuses.isEmpty()
                        || technicalStatuses.contains(s.getTechnicalStatus()))
                .sorted(Comparator.comparing(DiffusionSupport::getName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(DiffusionSupport::getId))
                .map(SupportService::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getByZone(Long zoneId) {
        return supportRepository.findByZoneId(zoneId).stream().map(SupportService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SupportResponse getById(Long id) {
        return toResponse(findSupport(id));
    }

    @Transactional
    public SupportResponse update(Long id, SupportRequest request) {
        DiffusionSupport support = findSupport(id);
        support.setZone(zoneService.findZone(request.getZoneId()));
        support.setName(request.getName());
        support.setSupportType(request.getSupportType());
        support.setLatitude(request.getLatitude());
        support.setLongitude(request.getLongitude());
        if (request.getTechnicalStatus() != null) {
            support.setTechnicalStatus(request.getTechnicalStatus());
        }
        if (request.getDiffusionCapacity() != null) {
            support.setDiffusionCapacity(request.getDiffusionCapacity());
        }
        if (request.getVisibilityScore() != null) {
            support.setVisibilityScore(request.getVisibilityScore());
        }
        applyPorteurFields(support, request);
        DiffusionSupport saved = supportRepository.save(support);
        auditService.record("SUPPORT_UPDATED", "SUPPORT", saved.getId(),
                "Modification du Porteur « " + saved.getName() + " »", details(saved));
        return toResponse(saved);
    }

    /**
     * Booked periods (TEMPORAIRE or CONFIRMEE reservations) and unavailability blocks of a support overlapping
     * [from, to], sorted by start. With both {@code startTime} and {@code endTime}, only periods whose daily times
     * overlap [startTime, endTime) are kept. Defaults: from = today, to = from + 90 days. No campaign or client data.
     */
    @Transactional(readOnly = true)
    public List<SupportAvailabilitySlot> getAvailability(Long id, LocalDate from, LocalDate to,
                                                         LocalTime startTime, LocalTime endTime) {
        if (!supportRepository.existsById(id)) {
            throw NetworkErrors.supportNotFound();
        }
        LocalDate start = from != null ? from : LocalDate.now(clock);
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_AVAILABILITY_DAYS);
        if (end.isBefore(start)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        boolean timeFilter = startTime != null && endTime != null;
        if (timeFilter && !startTime.isBefore(endTime)) {
            throw NetworkErrors.invalidTimeRange();
        }
        List<SupportAvailabilitySlot> slots = new ArrayList<>();
        for (Reservation reservation : reservationRepository.findBookedPeriodsForSupport(id, start, end, BLOCKING_STATUSES)) {
            if (!timeFilter || (reservation.getStartTime().isBefore(endTime) && startTime.isBefore(reservation.getEndTime()))) {
                slots.add(toSlot(reservation));
            }
        }
        for (SupportAvailability block : blockRepository
                .findBySupportIdAndAvailabilityDateBetweenOrderByAvailabilityDateAscStartTimeAsc(id, start, end)) {
            if (!AvailabilityRules.BLOCKING.contains(block.getAvailabilityStatus())) {
                continue;
            }
            if (!timeFilter || (block.getStartTime().isBefore(endTime) && startTime.isBefore(block.getEndTime()))) {
                slots.add(toSlot(block));
            }
        }
        slots.sort(Comparator.comparing(SupportAvailabilitySlot::getStartDate)
                .thenComparing(SupportAvailabilitySlot::getStartTime)
                .thenComparing(SupportAvailabilitySlot::getEndDate));
        return slots;
    }

    public DiffusionSupport findSupport(Long id) {
        return supportRepository.findById(id)
                .orElseThrow(NetworkErrors::supportNotFound);
    }

    /** Porteur fields: null = unchanged (create: stays null). A blank address clears it. */
    private static void applyPorteurFields(DiffusionSupport support, SupportRequest request) {
        if (request.getPorteurType() != null) {
            support.setPorteurType(PorteurType.valueOf(request.getPorteurType()));
        }
        if (request.getMastHeightM() != null) {
            support.setMastHeightM(request.getMastHeightM().shortValue());
        }
        if (request.getHeadingDeg() != null) {
            support.setHeadingDeg(request.getHeadingDeg().shortValue());
        }
        if (request.getAddress() != null) {
            String address = request.getAddress().strip();
            support.setAddress(address.isEmpty() ? null : address);
        }
    }

    static SupportAvailabilitySlot toSlot(Reservation reservation) {
        return SupportAvailabilitySlot.builder()
                .startDate(reservation.getStartDate())
                .endDate(reservation.getEndDate())
                .startTime(reservation.getStartTime())
                .endTime(reservation.getEndTime())
                .kind("RESERVATION")
                .availabilityStatus(reservation.getReservationStatus() == ReservationStatus.CONFIRMEE ? "OCCUPE" : "RESERVE")
                .reservationStatus(reservation.getReservationStatus().name())
                .build();
    }

    static SupportAvailabilitySlot toSlot(SupportAvailability block) {
        return SupportAvailabilitySlot.builder()
                .startDate(block.getAvailabilityDate())
                .endDate(block.getAvailabilityDate())
                .startTime(block.getStartTime())
                .endTime(block.getEndTime())
                .kind("BLOCAGE")
                .availabilityStatus(block.getAvailabilityStatus().name())
                .reason(block.getReason())
                .reservationStatus(null)
                .build();
    }

    public static SupportResponse toResponse(DiffusionSupport support) {
        return SupportResponse.builder()
                .id(support.getId())
                .zoneId(support.getZone().getId())
                .zoneName(support.getZone().getName())
                .name(support.getName())
                .supportType(support.getSupportType().name())
                .latitude(support.getLatitude())
                .longitude(support.getLongitude())
                .technicalStatus(support.getTechnicalStatus().name())
                .diffusionCapacity(support.getDiffusionCapacity())
                .porteurType(support.getPorteurType() != null ? support.getPorteurType().name() : null)
                .mastHeightM(support.getMastHeightM())
                .headingDeg(support.getHeadingDeg())
                .address(support.getAddress())
                .visibilityScore(support.getVisibilityScore())
                .distanceKm(null)
                .build();
    }

    private static Map<String, Object> details(DiffusionSupport support) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("zoneId", support.getZone().getId());
        details.put("supportType", support.getSupportType().name());
        details.put("technicalStatus", support.getTechnicalStatus().name());
        details.put("diffusionCapacity", support.getDiffusionCapacity());
        details.put("visibilityScore", support.getVisibilityScore());
        return details;
    }
}
