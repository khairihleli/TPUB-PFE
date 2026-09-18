package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.AiModerationSeverity;
import com.example.zelqanepfe.model.AiRuleType;
import com.example.zelqanepfe.model.AiSector;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiRuleResponse {
    private Long id;
    private String ruleName;
    private AiRuleType ruleType;
    private String pattern;
    private AiModerationSeverity severity;
    private AiSector sector;
    private Boolean isActive;
    private String description;
    private Instant createdAt;
    private Instant updatedAt;
}
