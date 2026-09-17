package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiModerationRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiModerationRuleRepository extends JpaRepository<AiModerationRule, Long> {

    List<AiModerationRule> findByIsActiveTrue();

    boolean existsByRuleNameIgnoreCase(String ruleName);

    boolean existsByRuleNameIgnoreCaseAndIdNot(String ruleName, Long id);
}
