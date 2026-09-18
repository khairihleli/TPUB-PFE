package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.AiRuleRequest;
import com.example.zelqanepfe.dto.AiRuleResponse;
import com.example.zelqanepfe.model.AiModerationRule;
import com.example.zelqanepfe.model.AiRuleType;
import com.example.zelqanepfe.repository.AiModerationRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * CRUD of the AI moderation rules ({@code /api/ai/rules}).
 */
@Service
@RequiredArgsConstructor
public class AiRuleService {

    private final AiModerationRuleRepository ruleRepository;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<AiRuleResponse> list(Boolean active, AiRuleType ruleType) {
        return ruleRepository.findAll().stream()
                .filter(rule -> active == null || active.equals(rule.getIsActive()))
                .filter(rule -> ruleType == null || ruleType == rule.getRuleType())
                .sorted(Comparator.comparing(AiModerationRule::getRuleName, String.CASE_INSENSITIVE_ORDER))
                .map(AiRuleService::toResponse)
                .toList();
    }

    @Transactional
    public AiRuleResponse create(AiRuleRequest request) {
        String name = request.getRuleName().trim();
        if (ruleRepository.existsByRuleNameIgnoreCase(name)) {
            throw CampaignErrors.aiRuleNameTaken();
        }
        validatePattern(request);
        AiModerationRule rule = new AiModerationRule();
        apply(rule, request);
        rule.setIsActive(request.getIsActive() == null || request.getIsActive());
        AiModerationRule saved = ruleRepository.save(rule);
        auditService.record("AI_RULE_CREATED", "AI_RULE", saved.getId(),
                "Création de la règle IA « " + saved.getRuleName() + " »", details(saved));
        return toResponse(saved);
    }

    @Transactional
    public AiRuleResponse update(Long id, AiRuleRequest request) {
        AiModerationRule rule = ruleRepository.findById(id).orElseThrow(CampaignErrors::aiRuleNotFound);
        String name = request.getRuleName().trim();
        if (ruleRepository.existsByRuleNameIgnoreCaseAndIdNot(name, id)) {
            throw CampaignErrors.aiRuleNameTaken();
        }
        validatePattern(request);
        apply(rule, request);
        if (request.getIsActive() != null) {
            rule.setIsActive(request.getIsActive());
        }
        AiModerationRule saved = ruleRepository.save(rule);
        auditService.record("AI_RULE_UPDATED", "AI_RULE", saved.getId(),
                "Modification de la règle IA « " + saved.getRuleName() + " »", details(saved));
        return toResponse(saved);
    }

    @Transactional
    public void delete(Long id) {
        AiModerationRule rule = ruleRepository.findById(id).orElseThrow(CampaignErrors::aiRuleNotFound);
        ruleRepository.delete(rule);
        auditService.record("AI_RULE_DELETED", "AI_RULE", id,
                "Suppression de la règle IA « " + rule.getRuleName() + " »", details(rule));
    }

    static void validatePattern(AiRuleRequest request) {
        if (request.getRuleType() == AiRuleType.REGEX) {
            try {
                Pattern.compile(request.getPattern());
            } catch (PatternSyntaxException ex) {
                throw CampaignErrors.invalidRegex(ex.getDescription());
            }
        }
    }

    private static void apply(AiModerationRule rule, AiRuleRequest request) {
        rule.setRuleName(request.getRuleName().trim());
        rule.setRuleType(request.getRuleType());
        rule.setPattern(request.getPattern().trim());
        rule.setSeverity(request.getSeverity());
        rule.setSector(request.getSector());
        rule.setDescription(request.getDescription() == null || request.getDescription().isBlank()
                ? null : request.getDescription().trim());
    }

    static AiRuleResponse toResponse(AiModerationRule rule) {
        return AiRuleResponse.builder()
                .id(rule.getId())
                .ruleName(rule.getRuleName())
                .ruleType(rule.getRuleType())
                .pattern(rule.getPattern())
                .severity(rule.getSeverity())
                .sector(rule.getSector())
                .isActive(rule.getIsActive())
                .description(rule.getDescription())
                .createdAt(rule.getCreatedAt())
                .updatedAt(rule.getUpdatedAt())
                .build();
    }

    private static Map<String, Object> details(AiModerationRule rule) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("ruleType", rule.getRuleType() != null ? rule.getRuleType().name() : null);
        details.put("pattern", rule.getPattern());
        details.put("severity", rule.getSeverity() != null ? rule.getSeverity().name() : null);
        details.put("sector", rule.getSector() != null ? rule.getSector().name() : null);
        details.put("isActive", rule.getIsActive());
        return details;
    }
}
