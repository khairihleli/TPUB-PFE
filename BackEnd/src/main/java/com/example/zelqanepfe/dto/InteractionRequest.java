package com.example.zelqanepfe.dto;

import com.example.zelqanepfe.model.InteractionType;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InteractionRequest {

    @NotNull
    private Long diffusionLogId;

    @NotNull
    private InteractionType type;
}
