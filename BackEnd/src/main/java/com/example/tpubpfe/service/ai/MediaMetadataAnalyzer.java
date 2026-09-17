package com.example.tpubpfe.service.ai;

import com.example.tpubpfe.model.AiIssueSource;

import java.util.ArrayList;
import java.util.List;

/**
 * Quality heuristics on media metadata (resolution, ratio, weight, video duration).
 */
public class MediaMetadataAnalyzer {

    public static final String LOW_RESOLUTION = "résolution insuffisante";
    public static final String BAD_RATIO = "format inadapté aux écrans";
    public static final String LIGHT_FILE = "fichier très léger";
    public static final String UNKNOWN_DURATION = "durée vidéo inconnue";
    public static final String VIDEO_TOO_LONG = "vidéo trop longue pour un Porteur";

    static final int MIN_WIDTH = 800;
    static final int MIN_HEIGHT = 450;
    static final long MIN_BYTES = 20L * 1024L;
    static final int MAX_VIDEO_SECONDS = 60;
    private static final double[] SCREEN_RATIOS = {16d / 9d, 9d / 16d, 1d};
    private static final double RATIO_TOLERANCE = 0.15;

    /** A quality finding with its score impact and the matching French advice. */
    public record MediaFinding(String label, AiIssueSource source, int qualityDelta, String recommendation) {
    }

    public List<MediaFinding> analyze(MediaInput media) {
        List<MediaFinding> findings = new ArrayList<>();
        if (media.isImage()) {
            Integer width = media.widthPx();
            Integer height = media.heightPx();
            if (width != null && height != null && width > 0 && height > 0) {
                if (width < MIN_WIDTH || height < MIN_HEIGHT) {
                    findings.add(new MediaFinding(LOW_RESOLUTION, AiIssueSource.IMAGE, -15,
                            "Fournissez un visuel d'au moins 1280×720 px"));
                }
                if (!screenRatio((double) width / height)) {
                    findings.add(new MediaFinding(BAD_RATIO, AiIssueSource.IMAGE, -5,
                            "Utilisez un format 16:9, 9:16 ou carré adapté aux écrans"));
                }
            }
            if (media.sizeBytes() != null && media.sizeBytes() < MIN_BYTES) {
                findings.add(new MediaFinding(LIGHT_FILE, AiIssueSource.IMAGE, -10,
                        "Fournissez un fichier de meilleure qualité (moins compressé)"));
            }
        } else if (media.isVideo()) {
            if (media.durationSeconds() == null) {
                findings.add(new MediaFinding(UNKNOWN_DURATION, AiIssueSource.VIDEO, -5,
                        "Indiquez la durée de la vidéo lors de l'envoi"));
            } else if (media.durationSeconds() > MAX_VIDEO_SECONDS) {
                findings.add(new MediaFinding(VIDEO_TOO_LONG, AiIssueSource.VIDEO, -10,
                        "Réduisez la vidéo à 60 secondes maximum"));
            }
        }
        return findings;
    }

    static boolean screenRatio(double ratio) {
        for (double target : SCREEN_RATIOS) {
            if (Math.abs(ratio - target) <= target * RATIO_TOLERANCE) {
                return true;
            }
        }
        return false;
    }
}
