package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.RoleCode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** PUT /api/admin/users/{id}. A null role keeps the current one. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserUpdateRequest {

    @NotBlank
    @Size(min = 1, max = 150)
    private String nom;

    @Size(max = 200)
    private String societe;

    @Pattern(regexp = MeUpdateRequest.PHONE_PATTERN, message = MeUpdateRequest.PHONE_MESSAGE)
    private String telephone;

    @Size(max = 1000)
    private String adresse;

    private RoleCode role;
}
