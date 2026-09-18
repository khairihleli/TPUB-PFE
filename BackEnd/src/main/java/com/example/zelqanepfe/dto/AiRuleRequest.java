package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.AiModerationSeverity;
import com.example.zelqanepfe.model.AiRuleType;
import com.example.zelqanepfe.model.AiSector;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiRuleRequest {

    @NotBlank
    @Size(min = 1, max = 150)
    private String ruleName;

    @NotNull
    private AiRuleType ruleType;

    @NotBlank
    @Size(min = 1, max = 2000)
    private String pattern;

    @NotNull
    private AiModerationSeverity severity;

    private AiSector sector;

    private Boolean isActive;

    @Size(max = 2000)
    private String description;
}
