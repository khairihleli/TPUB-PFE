package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.AiCalibrationResponse;
import com.example.zelqanepfe.dto.AiFeedbackResponse;
import com.example.zelqanepfe.dto.AiProvidersResponse;
import com.example.zelqanepfe.dto.AiQualityResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.AiCalibration;
import com.example.zelqanepfe.model.AiFeedbackOutcome;
import com.example.zelqanepfe.service.CampaignSearchSpecifications;
import com.example.zelqanepfe.service.ai.AiProvidersService;
import com.example.zelqanepfe.service.ai.learning.AiCalibrationService;
import com.example.zelqanepfe.service.ai.learning.AiFeedbackService;
import com.example.zelqanepfe.service.ai.learning.AiQualityService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** AI quality, feedback, calibration and engines (docs/round2-contract.md §2.7). */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiQualityController {

    private final AiProvidersService providersService;
    private final AiQualityService qualityService;
    private final AiFeedbackService feedbackService;
    private final AiCalibrationService calibrationService;

    @Operation(summary = "Effective AI engines: vision provider, OCR, video, learning")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/providers")
    public ResponseEntity<AiProvidersResponse> providers() {
        return ResponseEntity.ok(providersService.providers());
    }

    @Operation(summary = "AI error dashboard over a period (default: last 90 days)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/quality")
    public ResponseEntity<AiQualityResponse> quality(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(qualityService.quality(from, to));
    }

    @Operation(summary = "Administrator decisions compared with the AI verdict")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/feedback")
    public ResponseEntity<PageResponse<AiFeedbackResponse>> feedback(
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) Long ruleId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<AiFeedbackOutcome> outcomes = CampaignSearchSpecifications.parseEnums(outcome, AiFeedbackOutcome.class, "outcome");
        return ResponseEntity.ok(feedbackService.search(outcomes, ruleId, from, to, page, size));
    }

    @Operation(summary = "Calibration versions, newest first (at most 50)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/calibrations")
    public ResponseEntity<List<AiCalibrationResponse>> calibrations() {
        return ResponseEntity.ok(calibrationService.history());
    }

    @Operation(summary = "Recalibrate now from the administrator feedback")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/calibrations/recalibrate")
    public ResponseEntity<AiCalibrationResponse> recalibrate() {
        return ResponseEntity.status(HttpStatus.CREATED).body(calibrationService.recalibrate(AiCalibration.Trigger.MANUEL));
    }

    @Operation(summary = "Activate a calibration version")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/calibrations/{version}/activate")
    public ResponseEntity<AiCalibrationResponse> activate(@PathVariable int version) {
        return ResponseEntity.ok(calibrationService.activate(version));
    }
}
