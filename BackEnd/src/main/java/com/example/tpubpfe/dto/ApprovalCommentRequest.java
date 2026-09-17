package com.example.tpubpfe.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Body of the emergency approval endpoint. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovalCommentRequest {

    @Size(max = 500)
    private String comment;
}
