package com.example.tpubpfe.dto;

import com.example.tpubpfe.model.InteractionType;
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
