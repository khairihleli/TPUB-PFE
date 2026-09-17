package com.example.tpubpfe.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminValidateRequest {

    private Boolean overrideAi;

    @Size(max = 1000)
    private String comment;

    @Min(0)
    @Max(10)
    private Integer priorityScore;
}
