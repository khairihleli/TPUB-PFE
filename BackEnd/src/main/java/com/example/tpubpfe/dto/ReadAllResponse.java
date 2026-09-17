package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Number of notifications marked as read. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReadAllResponse {

    private int updated;
}
