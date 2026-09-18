package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AuditLogResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.AuditLog;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.AuditLogRepository;
import com.example.zelqanepfe.repository.UserRepository;
import com.example.zelqanepfe.security.RequestInfo;
import com.example.zelqanepfe.security.UserDetailsImpl;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Audit trail of administrative actions (signature fixed by the completion contract §2.0). Entries join the
 * caller's transaction, so an action that rolls back leaves no audit row.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private static final int MAX_PAGE_SIZE = 100;

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    /** Query filters of {@code GET /api/admin/audit}; every field is optional. */
    public record Filter(Long actorId, List<String> actions, String entityType, String entityId, LocalDate from,
                         LocalDate to) {
    }

    @Transactional
    public void record(String action, String entityType, Object entityId, String summary, Map<String, Object> details) {
        UserDetailsImpl actor = SecurityUtils.currentUserOrNull();
        AuditLog entry = AuditLog.builder()
                .actorUserId(actor == null ? null : actor.getId())
                .actorEmail(actor == null ? null : RequestInfo.truncate(actor.getEmail(), 255))
                .actorRole(actor == null ? null : actor.getRoleCode())
                .action(RequestInfo.truncate(Objects.requireNonNull(action, "action"), 60))
                .entityType(RequestInfo.truncate(Objects.requireNonNull(entityType, "entityType"), 40))
                .entityId(entityId == null ? null : RequestInfo.truncate(String.valueOf(entityId), 64))
                .summary(RequestInfo.truncate(summary == null || summary.isBlank() ? action : summary, 500))
                .details(details == null ? null : sanitize(details))
                .ipAddress(RequestInfo.clientIp(RequestInfo.currentRequest()))
                .createdAt(clock.instant())
                .build();
        auditLogRepository.save(entry);
        log.info("AUDIT action={} entityType={} entityId={} actorId={}", entry.getAction(), entry.getEntityType(),
                entry.getEntityId(), entry.getActorUserId());
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(Filter filter, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)),
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<AuditLog> result = auditLogRepository.findAll(specification(filter), pageable);
        Map<Long, User> actors = userRepository.findAllById(result.getContent().stream()
                        .map(AuditLog::getActorUserId).filter(Objects::nonNull).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        return PageResponse.of(result.map(entry -> toResponse(entry, actors.get(entry.getActorUserId()))));
    }

    Specification<AuditLog> specification(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.actorId() != null) {
                predicates.add(cb.equal(root.get("actorUserId"), filter.actorId()));
            }
            if (filter.actions() != null && !filter.actions().isEmpty()) {
                predicates.add(root.get("action").in(filter.actions()));
            }
            if (filter.entityType() != null && !filter.entityType().isBlank()) {
                predicates.add(cb.equal(root.get("entityType"), filter.entityType().trim()));
            }
            if (filter.entityId() != null && !filter.entityId().isBlank()) {
                predicates.add(cb.equal(root.get("entityId"), filter.entityId().trim()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), startOfDay(filter.from())));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThan(root.get("createdAt"), startOfDay(filter.to().plusDays(1))));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Instant startOfDay(LocalDate date) {
        return date.atStartOfDay(clock.getZone()).toInstant();
    }

    static AuditLogResponse toResponse(AuditLog entry, User actor) {
        return AuditLogResponse.builder()
                .id(entry.getId())
                .actorUserId(entry.getActorUserId())
                .actorEmail(entry.getActorEmail())
                .actorName(actor == null ? null : actor.getNom())
                .actorRole(entry.getActorRole())
                .action(entry.getAction())
                .entityType(entry.getEntityType())
                .entityId(entry.getEntityId())
                .summary(entry.getSummary())
                .details(entry.getDetails())
                .ipAddress(entry.getIpAddress())
                .createdAt(entry.getCreatedAt())
                .build();
    }

    /**
     * Converts details to JSON-safe values: strings, booleans, integral numbers and plain decimals are kept,
     * maps and collections are converted recursively, everything else (dates, enums, entities) becomes a string.
     */
    static Map<String, Object> sanitize(Map<String, Object> details) {
        Map<String, Object> safe = new LinkedHashMap<>();
        details.forEach((key, value) -> safe.put(String.valueOf(key), sanitizeValue(value)));
        return safe;
    }

    private static Object sanitizeValue(Object value) {
        if (value == null || value instanceof String || value instanceof Boolean
                || value instanceof Integer || value instanceof Long || value instanceof Short
                || value instanceof Double || value instanceof Float || value instanceof BigInteger) {
            return value;
        }
        if (value instanceof BigDecimal) {
            return value;
        }
        if (value instanceof Enum<?> e) {
            return e.name();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> nested = new LinkedHashMap<>();
            map.forEach((k, v) -> nested.put(String.valueOf(k), sanitizeValue(v)));
            return nested;
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(AuditService::sanitizeValue).toList();
        }
        return String.valueOf(value);
    }
}
