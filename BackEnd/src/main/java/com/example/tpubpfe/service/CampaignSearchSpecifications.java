package com.example.tpubpfe.service;

import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignAiStatus;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.CampaignZone;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.ReservationStatus;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.User;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Campaign search filters (contract §2.1 {@code GET /api/campaigns}, {@code GET /api/campaigns/mine}).
 */
public final class CampaignSearchSpecifications {

    private static final Map<String, String> SORT_FIELDS = Map.of(
            "createdAt", "createdAt",
            "name", "name",
            "startDate", "startDate",
            "budget", "budget",
            "submittedAt", "submittedAt");

    private CampaignSearchSpecifications() {
    }

    public record Filter(
            String q,
            String client,
            Long clientId,
            Long zoneId,
            List<CampaignStatus> statuses,
            List<CampaignAiStatus> aiStatuses,
            LocalDate from,
            LocalDate to,
            List<SupportType> supportTypes
    ) {

        public static Filter empty() {
            return new Filter(null, null, null, null, List.of(), List.of(), null, null, List.of());
        }

        public Filter withClientId(Long ownerClientId) {
            return new Filter(q, client, ownerClientId, zoneId, statuses, aiStatuses, from, to, supportTypes);
        }
    }

    public static Specification<Campaign> of(Filter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (notBlank(filter.q())) {
                predicates.add(cb.like(cb.lower(root.get("name")), likePattern(filter.q())));
            }
            if (filter.clientId() != null) {
                predicates.add(cb.equal(root.get("client").get("id"), filter.clientId()));
            }
            if (notBlank(filter.client())) {
                Join<Campaign, Client> client = root.join("client", JoinType.INNER);
                Join<Client, User> user = client.join("user", JoinType.LEFT);
                String pattern = likePattern(filter.client());
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.coalesce(client.<String>get("companyName"), "")), pattern),
                        cb.like(cb.lower(cb.coalesce(user.<String>get("nom"), "")), pattern),
                        cb.like(cb.lower(cb.coalesce(user.<String>get("email"), "")), pattern)));
            }
            if (filter.statuses() != null && !filter.statuses().isEmpty()) {
                predicates.add(root.get("status").in(filter.statuses()));
            }
            if (filter.aiStatuses() != null && !filter.aiStatuses().isEmpty()) {
                predicates.add(root.get("aiStatus").in(filter.aiStatuses()));
            }
            if (filter.from() != null || filter.to() != null) {
                predicates.add(cb.isNotNull(root.get("startDate")));
                predicates.add(cb.isNotNull(root.get("endDate")));
                if (filter.to() != null) {
                    predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), filter.to()));
                }
                if (filter.from() != null) {
                    predicates.add(cb.greaterThanOrEqualTo(root.get("endDate"), filter.from()));
                }
            }
            if (filter.zoneId() != null) {
                Subquery<Long> zoneSub = query.subquery(Long.class);
                Root<CampaignZone> cz = zoneSub.from(CampaignZone.class);
                zoneSub.select(cz.get("id")).where(
                        cb.equal(cz.get("campaign"), root),
                        cb.equal(cz.get("zone").get("id"), filter.zoneId()));
                Subquery<Long> reservationSub = query.subquery(Long.class);
                Root<Reservation> r = reservationSub.from(Reservation.class);
                reservationSub.select(r.get("id")).where(
                        cb.equal(r.get("campaign"), root),
                        cb.equal(r.get("zone").get("id"), filter.zoneId()));
                predicates.add(cb.or(cb.exists(zoneSub), cb.exists(reservationSub)));
            }
            if (filter.supportTypes() != null && !filter.supportTypes().isEmpty()) {
                Subquery<Long> sub = query.subquery(Long.class);
                Root<Reservation> r = sub.from(Reservation.class);
                sub.select(r.get("id")).where(
                        cb.equal(r.get("campaign"), root),
                        r.get("reservationStatus").in(List.of(ReservationStatus.TEMPORAIRE, ReservationStatus.CONFIRMEE)),
                        r.get("support").get("supportType").in(filter.supportTypes()));
                predicates.add(cb.exists(sub));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    /** {@code field,asc|desc} with a whitelisted field; default {@code createdAt,desc}. */
    public static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        }
        String[] parts = sort.split(",");
        String field = SORT_FIELDS.get(parts[0].trim());
        if (field == null) {
            throw CampaignErrors.invalidParameter("sort",
                    "Tri invalide : utilisez createdAt, name, startDate, budget ou submittedAt.");
        }
        Sort.Direction direction = Sort.Direction.DESC;
        if (parts.length > 1) {
            String dir = parts[1].trim().toLowerCase(Locale.ROOT);
            if ("asc".equals(dir)) {
                direction = Sort.Direction.ASC;
            } else if (!"desc".equals(dir)) {
                throw CampaignErrors.invalidParameter("sort", "Sens de tri invalide : utilisez asc ou desc.");
            }
        }
        return Sort.by(new Sort.Order(direction, field), Sort.Order.desc("id"));
    }

    /** Parses a comma-separated list of enum names (case-insensitive); null/blank gives an empty list. */
    public static <E extends Enum<E>> List<E> parseEnums(String raw, Class<E> type, String parameter) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(value -> {
                    try {
                        return Enum.valueOf(type, value.toUpperCase(Locale.ROOT));
                    } catch (IllegalArgumentException ex) {
                        throw CampaignErrors.invalidParameter(parameter, "Valeur invalide pour " + parameter + " : " + value);
                    }
                })
                .distinct()
                .toList();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String likePattern(String value) {
        String escaped = value.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
