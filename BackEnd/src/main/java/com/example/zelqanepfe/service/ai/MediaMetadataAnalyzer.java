package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.model.AiIssueSource;
import com.example.zelqanepfe.service.ai.media.ImageAnalyzer;
import com.example.zelqanepfe.service.ai.media.MediaFinding;

import java.util.ArrayList;
import java.util.List;

/**
 * Quality heuristics on media metadata: resolution and format from the dimensions (docs/round2-contract.md §2.4),
 * file weight, video duration.
 */
public class MediaMetadataAnalyzer {

    public static final String LIGHT_FILE = "fichier très léger";
    public static final String UNKNOWN_DURATION = "durée vidéo inconnue";
    public static final String VIDEO_TOO_LONG = "vidéo trop longue pour un Porteur";

    static final long MIN_BYTES = 20L * 1024L;
    static final int MAX_VIDEO_SECONDS = 60;

    public List<MediaFinding> analyze(MediaInput media) {
        List<MediaFinding> findings = new ArrayList<>();
        Integer width = media.widthPx();
        Integer height = media.heightPx();
        if (width != null && height != null && width > 0 && height > 0) {
            AiIssueSource source = media.isVideo() ? AiIssueSource.VIDEO : AiIssueSource.IMAGE;
            findings.addAll(ImageAnalyzer.dimensionFindings(width, height, source));
        }
        if (media.isImage()) {
            if (media.sizeBytes() != null && media.sizeBytes() < MIN_BYTES) {
                findings.add(MediaFinding.quality(LIGHT_FILE, AiIssueSource.IMAGE, -10,
                        "Fournissez un fichier de meilleure qualité (moins compressé)"));
            }
        } else if (media.isVideo()) {
            if (media.durationSeconds() == null) {
                findings.add(MediaFinding.quality(UNKNOWN_DURATION, AiIssueSource.VIDEO, -5,
                        "Indiquez la durée de la vidéo lors de l'envoi"));
            } else if (media.durationSeconds() > MAX_VIDEO_SECONDS) {
                findings.add(MediaFinding.quality(VIDEO_TOO_LONG, AiIssueSource.VIDEO, -10,
                        "Réduisez la vidéo à 60 secondes maximum"));
            }
        }
        return findings;
    }
}
