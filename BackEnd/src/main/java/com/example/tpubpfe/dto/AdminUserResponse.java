package com.example.tpubpfe.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;
import lombok.experimental.SuperBuilder;

/** A user as seen by the back-office: the profile plus activity counters. */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class AdminUserResponse extends MeResponse {

    private long activeSessions;
    /** 0 for staff. */
    private long campaignsCount;
    private String clientNotes;
}
