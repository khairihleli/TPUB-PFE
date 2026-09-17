package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.DiffusionLogResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.model.DiffusionContentType;
import com.example.tpubpfe.model.DiffusionLog;
import com.example.tpubpfe.model.InteractionType;
import com.example.tpubpfe.repository.DiffusionInteractionRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Diffusion journal (contract §2.5 {@code GET /api/diffusion/logs}).
 */
@Service
@RequiredArgsConstructor
public class DiffusionLogQueryService {

    static final int MAX_PAGE_SIZE = 100;

    private final DiffusionLogRepository diffusionLogRepository;
    private final DiffusionInteractionRepository interactionRepository;
    private final Clock clock;

    public record Filter(Long supportId, Long zoneId, Long campaignId, List<DiffusionContentType> contentTypes,
                         LocalDate from, LocalDate to) {
    }

    @Transactional(readOnly = true)
    public PageResponse<DiffusionLogResponse> search(Filter filter, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)),
                Sort.by(Sort.Order.desc("diffusedAt"), Sort.Order.desc("id")));
        Page<DiffusionLog> result = diffusionLogRepository.findAll(specification(filter), pageable);
        List<Long> ids = result.getContent().stream().map(DiffusionLog::getId).toList();
        Map<Long, long[]> counts = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Object[] row : interactionRepository.countByLogIds(ids)) {
                long[] pair = counts.computeIfAbsent((Long) row[0], k -> new long[2]);
                pair[row[1] == InteractionType.CLIC ? 0 : 1] += ((Number) row[2]).longValue();
            }
        }
        List<DiffusionLogResponse> items = result.getContent().stream()
                .map(log -> toResponse(log, counts.getOrDefault(log.getId(), new long[2])))
                .toList();
        return PageResponse.<DiffusionLogResponse>builder()
                .items(items)
                .page(result.getNumber())
                .size(result.getSize())
                .totalItems(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    Specification<DiffusionLog> specification(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.supportId() != null) {
                predicates.add(cb.equal(root.get("support").get("id"), filter.supportId()));
            }
            if (filter.zoneId() != null) {
                predicates.add(cb.equal(root.get("zone").get("id"), filter.zoneId()));
            }
            if (filter.campaignId() != null) {
                predicates.add(cb.equal(root.get("campaign").get("id"), filter.campaignId()));
            }
            if (filter.contentTypes() != null && !filter.contentTypes().isEmpty()) {
                predicates.add(root.get("contentType").in(filter.contentTypes()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("diffusedAt"),
                        filter.from().atStartOfDay(clock.getZone()).toInstant()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThan(root.get("diffusedAt"),
                        filter.to().plusDays(1).atStartOfDay(clock.getZone()).toInstant()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static DiffusionLogResponse toResponse(DiffusionLog log, long[] counts) {
        return DiffusionLogResponse.builder()
                .id(log.getId())
                .supportId(log.getSupport().getId())
                .supportName(log.getSupport().getName())
                .zoneId(log.getZone() != null ? log.getZone().getId() : null)
                .zoneName(log.getZone() != null ? log.getZone().getName() : null)
                .campaignId(log.getCampaign() != null ? log.getCampaign().getId() : null)
                .campaignName(log.getCampaign() != null ? log.getCampaign().getName() : null)
                .emergencyId(log.getEmergency() != null ? log.getEmergency().getId() : null)
                .contentType(log.getContentType().name())
                .title(log.getTitle())
                .mediaUrl(log.getMediaUrl())
                .durationSeconds(log.getDurationSeconds() != null ? log.getDurationSeconds().intValue() : null)
                .priority(log.getPriority() != null ? log.getPriority() : 0)
                .cost(log.getCost())
                .clicks(counts[0])
                .interactions(counts[1])
                .diffusedAt(log.getDiffusedAt())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
