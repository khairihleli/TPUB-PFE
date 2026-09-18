package com.example.zelqanepfe.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** POST /api/me/password. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PasswordChangeRequest {

    public static final String STRENGTH_PATTERN = "^(?=.*\\p{L})(?=.*\\d).*$";
    public static final String STRENGTH_MESSAGE = "Le mot de passe doit contenir au moins une lettre et un chiffre.";

    @NotBlank
    private String currentPassword;

    @NotBlank
    @Size(min = 8, max = 100)
    @Pattern(regexp = STRENGTH_PATTERN, message = STRENGTH_MESSAGE)
    private String newPassword;
}
