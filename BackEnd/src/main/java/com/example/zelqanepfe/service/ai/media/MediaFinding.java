package com.example.zelqanepfe.service.ai.media;

import com.example.zelqanepfe.model.AiIssueSource;

/**
 * A media finding with its score impact and the matching French advice.
 *
 * @param qualityDelta quality points (≤ 0)
 * @param riskPoints   risk points (≥ 0), 0 for pure quality findings
 * @param riskLabel    label of the risk issue when {@code riskPoints > 0}
 */
public record MediaFinding(String label, AiIssueSource source, int qualityDelta, String recommendation,
                           int riskPoints, String riskLabel) {

    public static MediaFinding quality(String label, AiIssueSource source, int qualityDelta, String recommendation) {
        return new MediaFinding(label, source, qualityDelta, recommendation, 0, null);
    }
}
