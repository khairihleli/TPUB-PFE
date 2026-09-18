package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.RoleCode;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** POST /api/admin/users: staff account creation (ADMINISTRATEUR | OPERATEUR | SUPERVISEUR). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserCreateRequest {

    @NotBlank
    @Email
    @Size(max = 255)
    private String email;

    @NotBlank
    @Size(min = 8, max = 100)
    private String password;

    @NotBlank
    @Size(min = 1, max = 150)
    private String nom;

    @NotNull
    private RoleCode role;

    @Size(max = 200)
    private String societe;

    @Pattern(regexp = MeUpdateRequest.PHONE_PATTERN, message = MeUpdateRequest.PHONE_MESSAGE)
    private String telephone;
}
