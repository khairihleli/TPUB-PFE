package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.SupportAvailabilitySlot;
import com.example.tpubpfe.dto.SupportRequest;
import com.example.tpubpfe.dto.SupportResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.PorteurType;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SupportService {

    /** Default availability window when {@code to} is omitted: {@code from} + 90 days. */
    static final int DEFAULT_AVAILABILITY_DAYS = 90;

    private static final List<ReservationStatus> BLOCKING_STATUSES =
            List.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE);

    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final ZoneService zoneService;

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
                .build();
        applyPorteurFields(support, request);
        return toResponse(supportRepository.save(support));
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getAll() {
        return supportRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getByZone(Long zoneId) {
        return supportRepository.findByZoneId(zoneId).stream().map(this::toResponse).toList();
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
        applyPorteurFields(support, request);
        return toResponse(supportRepository.save(support));
    }

    /**
     * Booked periods (TEMPORAIRE or CONFIRMEE reservations) on a support overlapping [from, to], sorted by start date.
     * Defaults: from = today, to = from + 90 days. No campaign or client data is exposed.
     */
    @Transactional(readOnly = true)
    public List<SupportAvailabilitySlot> getAvailability(Long id, LocalDate from, LocalDate to) {
        if (!supportRepository.existsById(id)) {
            throw new ResourceNotFoundException("Support not found: " + id);
        }
        LocalDate start = from != null ? from : LocalDate.now();
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_AVAILABILITY_DAYS);
        if (end.isBefore(start)) {
            throw new BadRequestException("'to' must be on or after 'from'");
        }
        return reservationRepository.findBookedPeriodsForSupport(id, start, end, BLOCKING_STATUSES).stream()
                .map(SupportService::toSlot)
                .toList();
    }

    public DiffusionSupport findSupport(Long id) {
        return supportRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Support not found: " + id));
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

    private static SupportAvailabilitySlot toSlot(Reservation reservation) {
        return SupportAvailabilitySlot.builder()
                .startDate(reservation.getStartDate())
                .endDate(reservation.getEndDate())
                .startTime(reservation.getStartTime())
                .endTime(reservation.getEndTime())
                .reservationStatus(reservation.getReservationStatus().name())
                .build();
    }

    private SupportResponse toResponse(DiffusionSupport support) {
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
                .build();
    }
}
