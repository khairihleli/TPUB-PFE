package com.example.tpubpfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** {@code POST /api/admin/users/{id}/password/reset}: the temporary password is shown once. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TemporaryPasswordResponse {

    private Long userId;
    private String email;
    /** Clear temporary password, returned once and never stored. */
    private String temporaryPassword;
    /** Always true: the account must choose a new password at the next login. */
    private boolean mustChangePassword;
    /** Sessions closed by the reset. */
    private int revokedSessions;
}
