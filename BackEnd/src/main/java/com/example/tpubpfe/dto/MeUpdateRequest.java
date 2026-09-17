package com.example.tpubpfe.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** PUT /api/me. Blank optional fields are stored as null. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MeUpdateRequest {

    public static final String PHONE_PATTERN = "^[+0-9 ().-]{6,30}$";
    public static final String PHONE_MESSAGE = "Numéro de téléphone invalide (6 à 30 caractères : chiffres, espaces, + ( ) . -).";

    @NotBlank
    @Size(min = 1, max = 150)
    private String nom;

    @Size(max = 200)
    private String societe;

    @Pattern(regexp = PHONE_PATTERN, message = PHONE_MESSAGE)
    private String telephone;

    @Size(max = 1000)
    private String adresse;
}
