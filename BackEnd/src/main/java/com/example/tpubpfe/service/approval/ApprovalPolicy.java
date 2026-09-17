package com.example.tpubpfe.service.approval;

import com.example.tpubpfe.config.SupervisionProperties;
import com.example.tpubpfe.dto.ApprovalResponse;
import com.example.tpubpfe.model.Approval;
import com.example.tpubpfe.model.ApprovalDecision;
import com.example.tpubpfe.model.ApprovalEntityType;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.ApprovalRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Shared rules of the multi-level approval (docs/round2-contract.md §5.4): how many distinct administrators are
 * needed, and the {@code approvals} rows themselves.
 */
@Service
@RequiredArgsConstructor
public class ApprovalPolicy {

    /** Emergency messages have a single approval cycle. */
    public static final String EMERGENCY_CYCLE = "emergency";

    private final ApprovalRepository approvalRepository;
    private final UserRepository userRepository;
    private final SupervisionProperties.Approval properties;
    private final Clock clock;

    public int configuredForEmergency() {
        return Math.max(1, properties.getEmergencyRequiredApprovals());
    }

    public int configuredForCampaign() {
        return Math.max(1, properties.getCampaignRequiredApprovals());
    }

    public int campaignRiskThreshold() {
        return properties.getCampaignRiskThreshold();
    }

    /** {@code min(configured, active administrators)}, never below 1. */
    @Transactional(readOnly = true)
    public int effective(int configured) {
        return effective(configured, userRepository.countActiveByRoleCode(RoleCode.ADMINISTRATEUR));
    }

    /** Pure rule, unit-tested. */
    public static int effective(int configured, long activeAdministrators) {
        int capped = (int) Math.min(Math.max(1, configured), Math.max(1L, activeAdministrators));
        return Math.max(1, capped);
    }

    @Transactional(readOnly = true)
    public List<Approval> approvals(ApprovalEntityType type, Long entityId, String cycleKey) {
        return approvalRepository.findByEntityTypeAndEntityIdAndCycleKeyOrderByCreatedAtAscIdAsc(type, entityId,
                cycleKey);
    }

    @Transactional(readOnly = true)
    public List<Approval> approvals(ApprovalEntityType type, Collection<Long> entityIds) {
        return entityIds.isEmpty() ? List.of()
                : approvalRepository.findByEntityTypeAndEntityIdInOrderByCreatedAtAscIdAsc(type, entityIds);
    }

    /** Campaigns that received at least one approval, newest activity first. */
    @Transactional(readOnly = true)
    public List<Long> pendingCampaignIds() {
        return approvalRepository.findEntityIds(ApprovalEntityType.CAMPAIGN, ApprovalDecision.APPROUVE);
    }

    @Transactional
    public Approval record(ApprovalEntityType type, Long entityId, String cycleKey, Long approverUserId,
                           ApprovalDecision decision, String comment, Map<String, Object> details) {
        return approvalRepository.save(Approval.builder()
                .entityType(type)
                .entityId(entityId)
                .cycleKey(cycleKey)
                .approverUserId(approverUserId)
                .decision(decision)
                .comment(comment == null || comment.isBlank() ? null : comment.trim())
                .details(details)
                .createdAt(Instant.now(clock))
                .build());
    }

    /** Approvals (never refusals) of a cycle, with the approver names. */
    @Transactional(readOnly = true)
    public List<ApprovalResponse> toResponses(List<Approval> approvals) {
        Map<Long, User> users = userRepository.findAllById(approvals.stream()
                        .map(Approval::getApproverUserId).filter(Objects::nonNull).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        return approvals.stream()
                .map(approval -> ApprovalResponse.builder()
                        .id(approval.getId())
                        .approverUserId(approval.getApproverUserId())
                        .approverName(users.containsKey(approval.getApproverUserId())
                                ? users.get(approval.getApproverUserId()).getNom() : null)
                        .decision(approval.getDecision().name())
                        .comment(approval.getComment())
                        .createdAt(approval.getCreatedAt())
                        .build())
                .toList();
    }

    public static List<Approval> approved(List<Approval> approvals) {
        return approvals.stream().filter(a -> a.getDecision() == ApprovalDecision.APPROUVE).toList();
    }

    /** « Validée par Amina B. et Karim T. » */
    public static String approverSentence(List<ApprovalResponse> approvals) {
        List<String> names = approvals.stream()
                .map(ApprovalResponse::getApproverName)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (names.isEmpty()) {
            return "Validée par l'administration TPUB";
        }
        if (names.size() == 1) {
            return "Validée par " + names.get(0);
        }
        return "Validée par " + String.join(", ", names.subList(0, names.size() - 1)) + " et "
                + names.get(names.size() - 1);
    }
}
