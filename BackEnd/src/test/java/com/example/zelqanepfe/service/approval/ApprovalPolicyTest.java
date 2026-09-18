package com.example.zelqanepfe.service.approval;

import com.example.zelqanepfe.dto.ApprovalResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Pure rules of the multi-level approval (docs/round2-contract.md §5.4). */
class ApprovalPolicyTest {

    @Test
    void effectiveIsCappedByTheActiveAdministrators() {
        assertThat(ApprovalPolicy.effective(2, 5)).isEqualTo(2);
        assertThat(ApprovalPolicy.effective(2, 2)).isEqualTo(2);
        assertThat(ApprovalPolicy.effective(2, 1)).isEqualTo(1);
        assertThat(ApprovalPolicy.effective(2, 0)).isEqualTo(1);
        assertThat(ApprovalPolicy.effective(1, 9)).isEqualTo(1);
        assertThat(ApprovalPolicy.effective(0, 9)).isEqualTo(1);
        assertThat(ApprovalPolicy.effective(3, 4)).isEqualTo(3);
    }

    @Test
    void approverSentenceListsTheApprovers() {
        assertThat(ApprovalPolicy.approverSentence(List.of())).isEqualTo("Validée par l'administration ZELQANE");
        assertThat(ApprovalPolicy.approverSentence(List.of(approval("Amina B.")))).isEqualTo("Validée par Amina B.");
        assertThat(ApprovalPolicy.approverSentence(List.of(approval("Amina B."), approval("Karim T."))))
                .isEqualTo("Validée par Amina B. et Karim T.");
        assertThat(ApprovalPolicy.approverSentence(
                List.of(approval("A"), approval("B"), approval("C")))).isEqualTo("Validée par A, B et C");
        // A name repeated (two rows of the same administrator) appears once.
        assertThat(ApprovalPolicy.approverSentence(List.of(approval("A"), approval("A")))).isEqualTo("Validée par A");
    }

    private static ApprovalResponse approval(String name) {
        return ApprovalResponse.builder().approverName(name).decision("APPROUVE").build();
    }
}
