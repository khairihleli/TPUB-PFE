package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.DashboardResponse;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class StatisticsService {

    private final CampaignRepository campaignRepository;
    private final DiffusionSupportRepository supportRepository;
    private final ReservationRepository reservationRepository;
    private final DiffusionLogRepository diffusionLogRepository;

    @Transactional(readOnly = true)
    public DashboardResponse getDashboard() {
        long totalCampaigns = campaignRepository.count();
        long activeCampaigns = campaignRepository.findByStatus(CampaignStatus.ACTIVE).size();
        long pendingCampaigns = campaignRepository.findByStatus(CampaignStatus.PENDING_AI_CHECK).size()
                + campaignRepository.findByStatus(CampaignStatus.REVIEW_REQUIRED).size();
        long aiPending = campaignRepository.findByStatus(CampaignStatus.PENDING_AI_CHECK).size();
        long aiRejected = campaignRepository.findByStatus(CampaignStatus.REJECTED_BY_AI).size();
        long availableSupports = supportRepository.findAll().stream()
                .filter(s -> s.getTechnicalStatus() == TechnicalStatus.ACTIF)
                .count();
        long confirmedReservations = reservationRepository.findByReservationStatus(ReservationStatus.CONFIRMEE).size();
        long totalViews = diffusionLogRepository.count();

        BigDecimal estimatedBudget = campaignRepository.findAll().stream()
                .map(c -> c.getBudget())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal consumedBudget = campaignRepository.findAll().stream()
                .map(c -> c.getConsumedBudget())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return DashboardResponse.builder()
                .totalCampaigns(totalCampaigns)
                .activeCampaigns(activeCampaigns)
                .pendingCampaigns(pendingCampaigns)
                .aiPendingCampaigns(aiPending)
                .aiRejectedCampaigns(aiRejected)
                .availableSupports(availableSupports)
                .confirmedReservations(confirmedReservations)
                .totalViews(totalViews)
                .estimatedBudget(estimatedBudget)
                .consumedBudget(consumedBudget)
                .build();
    }
}
