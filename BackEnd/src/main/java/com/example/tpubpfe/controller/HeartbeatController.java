package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.HeartbeatRequest;
import com.example.tpubpfe.dto.HeartbeatResponse;
import com.example.tpubpfe.security.RequestInfo;
import com.example.tpubpfe.service.supervision.PresenceService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Player heartbeat (docs/round2-contract.md §5.2). The device key of the screen is checked by the interceptor of
 * lane L2 (§1.1); this controller only records the presence.
 */
@RestController
@RequestMapping("/api/diffusion")
@RequiredArgsConstructor
public class HeartbeatController {

    private final PresenceService presenceService;

    @Operation(summary = "Player heartbeat: keeps the screen online in the supervision view")
    @PostMapping("/heartbeat")
    public ResponseEntity<HeartbeatResponse> heartbeat(
            @RequestParam Long supportId,
            @Valid @RequestBody(required = false) HeartbeatRequest request,
            HttpServletRequest httpRequest
    ) {
        return ResponseEntity.ok(presenceService.heartbeat(supportId, request, RequestInfo.clientIp(httpRequest)));
    }
}
