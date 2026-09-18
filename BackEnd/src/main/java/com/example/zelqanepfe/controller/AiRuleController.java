package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.AiRuleRequest;
import com.example.zelqanepfe.dto.AiRuleResponse;
import com.example.zelqanepfe.model.AiRuleType;
import com.example.zelqanepfe.service.AiRuleService;
import com.example.zelqanepfe.service.CampaignSearchSpecifications;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai/rules")
@RequiredArgsConstructor
public class AiRuleController {

    private final AiRuleService aiRuleService;

    @Operation(summary = "List AI moderation rules")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping
    public ResponseEntity<List<AiRuleResponse>> list(
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) String ruleType
    ) {
        List<AiRuleType> types = CampaignSearchSpecifications.parseEnums(ruleType, AiRuleType.class, "ruleType");
        return ResponseEntity.ok(aiRuleService.list(active, types.isEmpty() ? null : types.get(0)));
    }

    @Operation(summary = "Create an AI moderation rule")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping
    public ResponseEntity<AiRuleResponse> create(@Valid @RequestBody AiRuleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(aiRuleService.create(request));
    }

    @Operation(summary = "Update an AI moderation rule")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PutMapping("/{id}")
    public ResponseEntity<AiRuleResponse> update(@PathVariable Long id, @Valid @RequestBody AiRuleRequest request) {
        return ResponseEntity.ok(aiRuleService.update(id, request));
    }

    @Operation(summary = "Delete an AI moderation rule")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        aiRuleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
