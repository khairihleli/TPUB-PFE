package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AiDecisionLogResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.AiContentCheck;
import com.example.zelqanepfe.model.AiDecisionLog;
import com.example.zelqanepfe.model.AiDecisionType;
import com.example.zelqanepfe.repository.AiDecisionLogRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code GET /api/ai/decisions}: AI and administrator decisions board.
 */
@Service
@RequiredArgsConstructor
public class AiDecisionQueryService {

    private final AiDecisionLogRepository decisionLogRepository;
    private final Clock clock;

    public record Filter(Long campaignId, AiDecisionType decisionType, String decision, LocalDate from, LocalDate to) {
    }

    @Transactional(readOnly = true)
    public PageResponse<AiDecisionLogResponse> search(Filter filter, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(100, size)),
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<AiDecisionLog> result = decisionLogRepository.findAll(specification(filter), pageable);
        return PageResponse.of(result.map(AiDecisionQueryService::toResponse));
    }

    Specification<AiDecisionLog> specification(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.campaignId() != null) {
                predicates.add(cb.equal(root.get("campaign").get("id"), filter.campaignId()));
            }
            if (filter.decisionType() != null) {
                predicates.add(cb.equal(root.get("decisionType"), filter.decisionType()));
            }
            if (filter.decision() != null && !filter.decision().isBlank()) {
                predicates.add(cb.equal(cb.upper(root.get("decision")), filter.decision().trim().toUpperCase()));
            }
            if (filter.from() != null) {
                Instant start = filter.from().atStartOfDay(clock.getZone()).toInstant();
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
            if (filter.to() != null) {
                Instant end = filter.to().plusDays(1).atStartOfDay(clock.getZone()).toInstant();
                predicates.add(cb.lessThan(root.get("createdAt"), end));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static AiDecisionLogResponse toResponse(AiDecisionLog log) {
        AiContentCheck check = log.getCheck();
        return AiDecisionLogResponse.builder()
                .id(log.getId())
                .campaignId(log.getCampaign().getId())
                .campaignName(log.getCampaign().getName())
                .checkId(check != null ? check.getId() : null)
                .decisionType(log.getDecisionType().name())
                .decision(log.getDecision())
                .reason(log.getReason())
                .decidedByUserId(log.getDecidedByUser() != null ? log.getDecidedByUser().getId() : null)
                .decidedByName(log.getDecidedByUser() != null ? log.getDecidedByUser().getNom() : null)
                .riskScore(check != null && check.getRiskScore() != null ? check.getRiskScore() : 0)
                .qualityScore(check != null && check.getQualityScore() != null ? check.getQualityScore() : 0)
                .preview(check != null && Boolean.TRUE.equals(check.getIsPreview()))
                .createdAt(log.getCreatedAt())
                .build();
    }
}
