package com.example.tpubpfe.controller;

import com.example.tpubpfe.dto.AdminUserCreateRequest;
import com.example.tpubpfe.dto.AdminUserResponse;
import com.example.tpubpfe.dto.AdminUserUpdateRequest;
import com.example.tpubpfe.dto.ClientValidationRequest;
import com.example.tpubpfe.dto.LoginHistoryResponse;
import com.example.tpubpfe.dto.PageResponse;
import com.example.tpubpfe.dto.RevokedCountResponse;
import com.example.tpubpfe.dto.RoleResponse;
import com.example.tpubpfe.dto.SessionResponse;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.service.AdminUserService;
import com.example.tpubpfe.service.CampaignSearchSpecifications;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    @Operation(summary = "Search user accounts (paginated)")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/users")
    public ResponseEntity<PageResponse<AdminUserResponse>> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) String validationStatus,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort
    ) {
        AdminUserService.Filter filter = new AdminUserService.Filter(q,
                CampaignSearchSpecifications.parseEnums(role, RoleCode.class, "role"),
                active,
                CampaignSearchSpecifications.parseEnums(validationStatus, ClientValidationStatus.class, "validationStatus"));
        return ResponseEntity.ok(adminUserService.search(filter, page, size, sort));
    }

    @Operation(summary = "Get a user account")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/users/{id}")
    public ResponseEntity<AdminUserResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.get(id));
    }

    @Operation(summary = "Create a staff account (ADMINISTRATEUR, OPERATEUR, SUPERVISEUR)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/users")
    public ResponseEntity<AdminUserResponse> create(@Valid @RequestBody AdminUserCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(adminUserService.create(request));
    }

    @Operation(summary = "Update a user account")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PutMapping("/users/{id}")
    public ResponseEntity<AdminUserResponse> update(@PathVariable Long id,
                                                    @Valid @RequestBody AdminUserUpdateRequest request) {
        return ResponseEntity.ok(adminUserService.update(id, request));
    }

    @Operation(summary = "Activate a user account")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/users/{id}/activate")
    public ResponseEntity<AdminUserResponse> activate(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.activate(id));
    }

    @Operation(summary = "Deactivate a user account (closes its sessions)")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/users/{id}/deactivate")
    public ResponseEntity<AdminUserResponse> deactivate(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.deactivate(id));
    }

    @Operation(summary = "Login history of a user")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/users/{id}/login-history")
    public ResponseEntity<List<LoginHistoryResponse>> loginHistory(@PathVariable Long id,
                                                                   @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(adminUserService.loginHistory(id, limit));
    }

    @Operation(summary = "Active sessions of a user")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/users/{id}/sessions")
    public ResponseEntity<List<SessionResponse>> sessions(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.sessions(id));
    }

    @Operation(summary = "Close every session of a user")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/users/{id}/sessions/revoke")
    public ResponseEntity<RevokedCountResponse> revokeSessions(@PathVariable Long id) {
        return ResponseEntity.ok(adminUserService.revokeSessions(id));
    }

    @Operation(summary = "Validate, reject or suspend an advertiser account")
    @PreAuthorize("hasRole('ADMINISTRATEUR')")
    @PostMapping("/clients/{clientId}/validation")
    public ResponseEntity<AdminUserResponse> clientValidation(@PathVariable Long clientId,
                                                              @Valid @RequestBody ClientValidationRequest request) {
        return ResponseEntity.ok(adminUserService.changeClientValidation(clientId, request));
    }

    @Operation(summary = "Roles and their permissions")
    @PreAuthorize("hasAnyRole('ADMINISTRATEUR', 'SUPERVISEUR')")
    @GetMapping("/roles")
    public ResponseEntity<List<RoleResponse>> roles() {
        return ResponseEntity.ok(adminUserService.roles());
    }
}
