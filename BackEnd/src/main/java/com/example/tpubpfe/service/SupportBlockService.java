package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.SupportBlockRequest;
import com.example.tpubpfe.dto.SupportBlockResponse;
import com.example.tpubpfe.model.AvailabilityStatus;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.SupportAvailability;
import com.example.tpubpfe.repository.SupportAvailabilityRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unavailability blocks of a support ({@code support_availability}), one row per day (contract §2.4).
 * Existing reservations are never cancelled by a block.
 */
@Service
@RequiredArgsConstructor
public class SupportBlockService {

    static final long MAX_BLOCK_DAYS = 92;
    private static final long DEFAULT_LIST_DAYS = 90;

    private final SupportAvailabilityRepository blockRepository;
    private final SupportService supportService;
    private final AuditService auditService;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<SupportBlockResponse> list(Long supportId, LocalDate from, LocalDate to) {
        supportService.findSupport(supportId);
        LocalDate start = from != null ? from : LocalDate.now(clock);
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_LIST_DAYS);
        if (end.isBefore(start)) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        return blockRepository.findBySupportIdAndAvailabilityDateBetweenOrderByAvailabilityDateAscStartTimeAsc(
                        supportId, start, end).stream()
                .filter(b -> AvailabilityRules.BLOCKING.contains(b.getAvailabilityStatus()))
                .map(SupportBlockService::toResponse)
                .toList();
    }

    @Transactional
    public List<SupportBlockResponse> create(Long supportId, SupportBlockRequest request) {
        DiffusionSupport support = supportService.findSupport(supportId);
        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw NetworkErrors.invalidRange("La date de fin doit être postérieure ou égale à la date de début.");
        }
        long days = ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate()) + 1;
        if (days > MAX_BLOCK_DAYS) {
            throw NetworkErrors.invalidRange("Une indisponibilité couvre au maximum 92 jours.");
        }
        if (!request.getStartTime().isBefore(request.getEndTime())) {
            throw NetworkErrors.invalidTimeRange();
        }
        if (!AvailabilityRules.BLOCKING.contains(request.getAvailabilityStatus())) {
            throw CampaignErrors.validationFailed("availabilityStatus",
                    "Statut d'indisponibilité invalide : MAINTENANCE, HORS_LIGNE ou OCCUPE.");
        }
        String reason = request.getReason() == null || request.getReason().isBlank() ? null : request.getReason().trim();
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        List<SupportAvailability> rows = new ArrayList<>();
        for (LocalDate day = request.getStartDate(); !day.isAfter(request.getEndDate()); day = day.plusDays(1)) {
            rows.add(SupportAvailability.builder()
                    .support(support)
                    .availabilityDate(day)
                    .startTime(request.getStartTime())
                    .endTime(request.getEndTime())
                    .availabilityStatus(request.getAvailabilityStatus())
                    .reason(reason)
                    .createdByUserId(user != null ? user.getId() : null)
                    .build());
        }
        List<SupportAvailability> saved = blockRepository.saveAll(rows);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("startDate", request.getStartDate().toString());
        details.put("endDate", request.getEndDate().toString());
        details.put("startTime", request.getStartTime().toString());
        details.put("endTime", request.getEndTime().toString());
        details.put("availabilityStatus", request.getAvailabilityStatus().name());
        details.put("reason", reason);
        details.put("days", days);
        auditService.record("SUPPORT_BLOCK_CREATED", "SUPPORT", support.getId(),
                "Indisponibilité « " + label(request.getAvailabilityStatus()) + " » du Porteur « " + support.getName()
                        + " » du " + request.getStartDate() + " au " + request.getEndDate(), details);
        return saved.stream().map(SupportBlockService::toResponse).toList();
    }

    @Transactional
    public void delete(Long supportId, Long blockId) {
        DiffusionSupport support = supportService.findSupport(supportId);
        SupportAvailability block = blockRepository.findByIdAndSupportId(blockId, supportId)
                .orElseThrow(NetworkErrors::supportBlockNotFound);
        blockRepository.delete(block);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("blockId", blockId);
        details.put("date", block.getAvailabilityDate().toString());
        details.put("availabilityStatus", block.getAvailabilityStatus().name());
        auditService.record("SUPPORT_BLOCK_DELETED", "SUPPORT", support.getId(),
                "Suppression d'une indisponibilité du Porteur « " + support.getName() + " » ("
                        + block.getAvailabilityDate() + ")", details);
    }

    static SupportBlockResponse toResponse(SupportAvailability block) {
        return SupportBlockResponse.builder()
                .id(block.getId())
                .supportId(block.getSupport().getId())
                .date(block.getAvailabilityDate())
                .startTime(block.getStartTime())
                .endTime(block.getEndTime())
                .availabilityStatus(block.getAvailabilityStatus().name())
                .reason(block.getReason())
                .createdAt(block.getCreatedAt())
                .build();
    }

    private static String label(AvailabilityStatus status) {
        return switch (status) {
            case MAINTENANCE -> "maintenance";
            case HORS_LIGNE -> "hors ligne";
            case OCCUPE -> "occupé";
            default -> status.name();
        };
    }
}
