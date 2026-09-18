package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.AiModerationRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiModerationRuleRepository extends JpaRepository<AiModerationRule, Long> {

    List<AiModerationRule> findByIsActiveTrue();

    boolean existsByRuleNameIgnoreCase(String ruleName);

    boolean existsByRuleNameIgnoreCaseAndIdNot(String ruleName, Long id);
}
