package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.AuditLogResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.service.AuditService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/admin/audit")
@RequiredArgsConstructor
public class AuditController {

    private final AuditService auditService;

    @Operation(summary = "Audit trail of administrative actions (paginated, newest first)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping
    public ResponseEntity<PageResponse<AuditLogResponse>> search(
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<String> actions = action == null ? List.of() : Arrays.stream(action.split(","))
                .map(a -> a.trim().toUpperCase(Locale.ROOT))
                .filter(a -> !a.isEmpty())
                .distinct()
                .toList();
        AuditService.Filter filter = new AuditService.Filter(actorId, actions,
                entityType == null ? null : entityType.trim().toUpperCase(Locale.ROOT), entityId, from, to);
        return ResponseEntity.ok(auditService.search(filter, page, size));
    }
}
