package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.ReservationRequest;
import com.example.tpubpfe.dto.ReservationResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final CampaignRepository campaignRepository;
    private final CampaignService campaignService;
    private final ZoneService zoneService;
    private final SupportService supportService;

    @Transactional
    public ReservationResponse create(ReservationRequest request) {
        Campaign campaign = campaignService.findCampaign(request.getCampaignId());

        List<Reservation> conflicts = reservationRepository.findConflictingReservations(
                request.getSupportId(),
                request.getStartDate(),
                request.getEndDate(),
                List.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE)
        );
        if (!conflicts.isEmpty()) {
            throw new BadRequestException("Support already reserved for the selected period");
        }

        long estimatedViews = 1000L;
        BigDecimal estimatedCost = campaign.getBudget().multiply(BigDecimal.valueOf(0.1));

        Reservation reservation = Reservation.builder()
                .campaign(campaign)
                .zone(zoneService.findZone(request.getZoneId()))
                .support(supportService.findSupport(request.getSupportId()))
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .availabilityStatus(AvailabilityStatus.RESERVE)
                .reservationStatus(ReservationStatus.TEMPORAIRE)
                .estimatedViews(estimatedViews)
                .estimatedCost(estimatedCost)
                .build();

        campaign.setEstimatedViews(campaign.getEstimatedViews() + estimatedViews);
        campaignRepository.save(campaign);
        return toResponse(reservationRepository.save(reservation));
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getByCampaign(Long campaignId) {
        return reservationRepository.findByCampaignId(campaignId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getAll() {
        return reservationRepository.findAll().stream().map(this::toResponse).toList();
    }

    private ReservationResponse toResponse(Reservation reservation) {
        return ReservationResponse.builder()
                .id(reservation.getId())
                .campaignId(reservation.getCampaign().getId())
                .zoneId(reservation.getZone().getId())
                .supportId(reservation.getSupport().getId())
                .startDate(reservation.getStartDate())
                .endDate(reservation.getEndDate())
                .startTime(reservation.getStartTime())
                .endTime(reservation.getEndTime())
                .availabilityStatus(reservation.getAvailabilityStatus().name())
                .reservationStatus(reservation.getReservationStatus().name())
                .estimatedViews(reservation.getEstimatedViews())
                .estimatedCost(reservation.getEstimatedCost())
                .build();
    }
}
