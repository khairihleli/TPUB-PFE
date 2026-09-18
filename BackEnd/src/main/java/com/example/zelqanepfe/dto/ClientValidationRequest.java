package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.ClientValidationStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** POST /api/admin/clients/{clientId}/validation. A null trustLevel keeps the current value. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClientValidationRequest {

    @NotNull
    private ClientValidationStatus validationStatus;

    @Min(0)
    @Max(100)
    private Integer trustLevel;

    @Size(max = 2000)
    private String notes;
}
