package com.example.zelqanepfe.service.ai.media;

import com.example.zelqanepfe.model.AiIssueSource;
import com.example.zelqanepfe.model.AiMediaAnalysis;
import com.example.zelqanepfe.service.ai.ocr.OcrBox;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Local image analysis, pure and deterministic (docs/round2-contract.md §2.4): format fit, resolution, sharpness
 * (Laplacian variance), brightness, contrast, text coverage from the OCR boxes and dominant colours (k-means).
 */
public final class ImageAnalyzer {

    public static final String FIT_16_9 = "16:9";
    public static final String FIT_9_16 = "9:16";
    public static final String FIT_SQUARE = "CARRE";
    public static final String FIT_NEAR = "PROCHE";
    public static final String FIT_OTHER = "AUTRE";

    public static final String LOW_RESOLUTION = "résolution insuffisante";
    public static final String MEDIUM_RESOLUTION = "résolution moyenne : 1920×1080 recommandé";
    public static final String SQUARE_FORMAT = "format carré : bandes noires sur les écrans 16:9 et 9:16";
    public static final String NEAR_FORMAT = "format proche de 16:9 ou 9:16 (recadrage léger)";
    public static final String BAD_FORMAT = "format inadapté aux écrans";
    public static final String BLURRY = "visuel flou";
    public static final String LIMITED_SHARPNESS = "netteté limitée";
    public static final String TOO_DARK = "visuel trop sombre";
    public static final String OVEREXPOSED = "visuel surexposé";
    public static final String LOW_CONTRAST = "contraste faible";
    public static final String TOO_MUCH_TEXT = "texte trop présent dans le visuel";
    public static final String TEXT_OVERLOAD_RISK = "surcharge textuelle : lisibilité réduite en circulation";
    public static final String UNIFORM = "visuel quasi uniforme";
    public static final String DECODE_FAILED = "analyse d'image impossible";

    static final int MIN_WIDTH = 800;
    static final int MIN_HEIGHT = 450;
    static final int GOOD_LONG_SIDE = 1280;
    static final int GOOD_SHORT_SIDE = 720;
    static final int KMEANS_K = 5;
    static final int KMEANS_ITERATIONS = 10;
    static final int KMEANS_SIDE = 64;
    private static final double R_16_9 = 16d / 9d;
    private static final double R_9_16 = 9d / 16d;

    private ImageAnalyzer() {
    }

    /**
     * @param image   decoded original image
     * @param boxes   confidence-filtered OCR boxes in original pixel coordinates
     * @param maxSide longest side of the working image (bilinear downscale)
     */
    public static AiMediaAnalysis.ImageMetrics analyze(BufferedImage image, List<OcrBox> boxes, int maxSide) {
        int width = image.getWidth();
        int height = image.getHeight();
        BufferedImage work = downscale(image, Math.max(8, maxSide));
        double[] luma = luma(work);
        int ww = work.getWidth();
        int wh = work.getHeight();

        double mean = 0;
        for (double y : luma) {
            mean += y;
        }
        mean /= luma.length;
        double variance = 0;
        for (double y : luma) {
            variance += (y - mean) * (y - mean);
        }
        variance /= luma.length;

        double ratio = (double) width / height;
        return AiMediaAnalysis.ImageMetrics.builder()
                .width(width)
                .height(height)
                .aspectRatio(round(ratio, 3))
                .aspectFit(aspectFit(ratio))
                .sharpness(round(laplacianVariance(luma, ww, wh), 1))
                .brightness(round(mean, 1))
                .contrast(round(Math.sqrt(variance), 1))
                .textCoverage(round(textCoverage(boxes, width, height), 3))
                .dominantColors(dominantColors(downscale(work, KMEANS_SIDE)))
                .build();
    }

    /** Relative distance to 16:9 or 9:16 decides the fit; a square is recognised before « proche ». */
    public static String aspectFit(double ratio) {
        double d169 = Math.abs(ratio - R_16_9) / R_16_9;
        double d916 = Math.abs(ratio - R_9_16) / R_9_16;
        double d = Math.min(d169, d916);
        if (d <= 0.05) {
            return d169 <= d916 ? FIT_16_9 : FIT_9_16;
        }
        if (Math.abs(ratio - 1d) <= 0.05) {
            return FIT_SQUARE;
        }
        return d <= 0.15 ? FIT_NEAR : FIT_OTHER;
    }

    /** Format and resolution findings, from the dimensions alone (metadata or decoded image). */
    public static List<MediaFinding> dimensionFindings(int width, int height, AiIssueSource source) {
        List<MediaFinding> findings = new ArrayList<>();
        if (width <= 0 || height <= 0) {
            return findings;
        }
        boolean insufficient = width < MIN_WIDTH || height < MIN_HEIGHT;
        if (insufficient) {
            findings.add(MediaFinding.quality(LOW_RESOLUTION, source, -15,
                    "Fournissez un visuel d'au moins 1280×720 px"));
        } else if (Math.max(width, height) < GOOD_LONG_SIDE || Math.min(width, height) < GOOD_SHORT_SIDE) {
            findings.add(MediaFinding.quality(MEDIUM_RESOLUTION, source, -5,
                    "Fournissez un visuel en 1920×1080 px pour un rendu net"));
        }
        switch (aspectFit((double) width / height)) {
            case FIT_SQUARE -> findings.add(MediaFinding.quality(SQUARE_FORMAT, source, -3,
                    "Préférez un format 16:9 ou 9:16 adapté aux écrans"));
            case FIT_NEAR -> findings.add(MediaFinding.quality(NEAR_FORMAT, source, -2,
                    "Recadrez le visuel au format 16:9 ou 9:16 exact"));
            case FIT_OTHER -> findings.add(MediaFinding.quality(BAD_FORMAT, source, -5,
                    "Utilisez un format 16:9 ou 9:16 adapté aux écrans"));
            default -> {
                // 16:9 or 9:16: nothing to report
            }
        }
        return findings;
    }

    /** Findings on pixel metrics (sharpness, exposure, contrast, text coverage, uniformity). */
    public static List<MediaFinding> metricFindings(AiMediaAnalysis.ImageMetrics m, AiIssueSource source) {
        List<MediaFinding> findings = new ArrayList<>();
        if (m == null) {
            return findings;
        }
        if (m.getSharpness() < 50) {
            findings.add(MediaFinding.quality(BLURRY, source, -15,
                    "Fournissez un visuel net (évitez les agrandissements)"));
        } else if (m.getSharpness() < 100) {
            findings.add(MediaFinding.quality(LIMITED_SHARPNESS, source, -5,
                    "Exportez le visuel en pleine résolution pour gagner en netteté"));
        }
        if (m.getBrightness() < 50) {
            findings.add(MediaFinding.quality(TOO_DARK, source, -10,
                    "Éclaircissez le visuel pour qu'il reste lisible sur écran"));
        } else if (m.getBrightness() > 215) {
            findings.add(MediaFinding.quality(OVEREXPOSED, source, -10,
                    "Réduisez l'exposition : les zones claires saturent à l'écran"));
        }
        if (m.getContrast() < 30) {
            findings.add(MediaFinding.quality(LOW_CONTRAST, source, -10,
                    "Renforcez le contraste entre le texte et le fond"));
        }
        String textAdvice = "Réduisez la surface de texte : un message court se lit mieux en circulation";
        if (m.getTextCoverage() > 0.50) {
            findings.add(new MediaFinding(TOO_MUCH_TEXT, source, -15, textAdvice, 5, TEXT_OVERLOAD_RISK));
        } else if (m.getTextCoverage() > 0.35) {
            findings.add(MediaFinding.quality(TOO_MUCH_TEXT, source, -10, textAdvice));
        }
        List<AiMediaAnalysis.DominantColor> colors = m.getDominantColors();
        if (colors != null && !colors.isEmpty() && colors.get(0).getShare() >= 0.90) {
            findings.add(MediaFinding.quality(UNIFORM, source, -10,
                    "Ajoutez un visuel plus riche : l'image est presque d'une seule couleur"));
        }
        return findings;
    }

    /**
     * Worst of several frames: minimum sharpness and contrast, the brightness farthest from mid-grey, maximum text
     * coverage. Dimensions and colours come from the middle frame (or the first one).
     */
    public static AiMediaAnalysis.ImageMetrics worst(List<AiMediaAnalysis.ImageMetrics> frames) {
        List<AiMediaAnalysis.ImageMetrics> present = frames == null ? List.of()
                : frames.stream().filter(java.util.Objects::nonNull).toList();
        if (present.isEmpty()) {
            return null;
        }
        AiMediaAnalysis.ImageMetrics base = present.get(present.size() / 2);
        return AiMediaAnalysis.ImageMetrics.builder()
                .width(base.getWidth())
                .height(base.getHeight())
                .aspectRatio(base.getAspectRatio())
                .aspectFit(base.getAspectFit())
                .sharpness(present.stream().mapToDouble(AiMediaAnalysis.ImageMetrics::getSharpness).min().orElse(0))
                .contrast(present.stream().mapToDouble(AiMediaAnalysis.ImageMetrics::getContrast).min().orElse(0))
                .brightness(present.stream()
                        .max(Comparator.comparingDouble(m -> Math.abs(m.getBrightness() - 127.5)))
                        .map(AiMediaAnalysis.ImageMetrics::getBrightness).orElse(0d))
                .textCoverage(present.stream().mapToDouble(AiMediaAnalysis.ImageMetrics::getTextCoverage).max().orElse(0))
                .dominantColors(new ArrayList<>(base.getDominantColors() == null ? List.of() : base.getDominantColors()))
                .build();
    }

    static BufferedImage downscale(BufferedImage source, int maxSide) {
        int w = source.getWidth();
        int h = source.getHeight();
        double factor = Math.min(1d, (double) maxSide / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * factor));
        int th = Math.max(1, (int) Math.round(h * factor));
        BufferedImage target = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.drawImage(source, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    static double[] luma(BufferedImage image) {
        int w = image.getWidth();
        int h = image.getHeight();
        double[] values = new double[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = image.getRGB(x, y);
                values[y * w + x] = 0.299 * ((rgb >> 16) & 0xFF) + 0.587 * ((rgb >> 8) & 0xFF) + 0.114 * (rgb & 0xFF);
            }
        }
        return values;
    }

    /** Variance of the 3×3 Laplacian [0,1,0;1,−4,1;0,1,0], borders excluded. */
    static double laplacianVariance(double[] luma, int w, int h) {
        if (w < 3 || h < 3) {
            return 0;
        }
        int n = (w - 2) * (h - 2);
        double sum = 0;
        double sumSq = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int i = y * w + x;
                double lap = luma[i - w] + luma[i + w] + luma[i - 1] + luma[i + 1] - 4 * luma[i];
                sum += lap;
                sumSq += lap * lap;
            }
        }
        double mean = sum / n;
        return Math.max(0, sumSq / n - mean * mean);
    }

    /** Σ box areas / image area, capped at 1. */
    static double textCoverage(List<OcrBox> boxes, int width, int height) {
        if (boxes == null || boxes.isEmpty() || width <= 0 || height <= 0) {
            return 0;
        }
        long area = boxes.stream().mapToLong(OcrBox::area).sum();
        return Math.min(1d, (double) area / ((double) width * height));
    }

    /**
     * k-means (k = 5, 10 iterations) in RGB on a ≤ 64×64 image. Deterministic init: the mean colour, then the pixel
     * farthest from the chosen centres. Shares rounded to 3 decimals, below 0.02 dropped, sorted by share.
     */
    static List<AiMediaAnalysis.DominantColor> dominantColors(BufferedImage small) {
        int w = small.getWidth();
        int h = small.getHeight();
        int n = w * h;
        double[][] px = new double[n][3];
        double[] mean = new double[3];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = small.getRGB(x, y);
                double[] p = px[y * w + x];
                p[0] = (rgb >> 16) & 0xFF;
                p[1] = (rgb >> 8) & 0xFF;
                p[2] = rgb & 0xFF;
                mean[0] += p[0];
                mean[1] += p[1];
                mean[2] += p[2];
            }
        }
        for (int c = 0; c < 3; c++) {
            mean[c] /= n;
        }
        List<double[]> centres = new ArrayList<>();
        centres.add(mean);
        while (centres.size() < KMEANS_K) {
            int farthest = -1;
            double best = 0;
            for (int i = 0; i < n; i++) {
                double d = nearestDistance(px[i], centres);
                if (d > best) {
                    best = d;
                    farthest = i;
                }
            }
            if (farthest < 0) {
                break;
            }
            centres.add(px[farthest].clone());
        }
        int k = centres.size();
        int[] assignment = new int[n];
        int[] counts = new int[k];
        for (int iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
            double[][] sums = new double[k][3];
            counts = new int[k];
            for (int i = 0; i < n; i++) {
                int nearest = nearest(px[i], centres);
                assignment[i] = nearest;
                counts[nearest]++;
                sums[nearest][0] += px[i][0];
                sums[nearest][1] += px[i][1];
                sums[nearest][2] += px[i][2];
            }
            for (int c = 0; c < k; c++) {
                if (counts[c] > 0) {
                    centres.set(c, new double[]{sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]});
                }
            }
        }
        // Final assignment with the last centres
        counts = new int[k];
        for (int i = 0; i < n; i++) {
            counts[nearest(px[i], centres)]++;
        }
        List<AiMediaAnalysis.DominantColor> colors = new ArrayList<>();
        for (int c = 0; c < k; c++) {
            double share = round((double) counts[c] / n, 3);
            if (share >= 0.02) {
                double[] centre = centres.get(c);
                colors.add(new AiMediaAnalysis.DominantColor(hex(centre), share));
            }
        }
        colors.sort(Comparator.comparingDouble(AiMediaAnalysis.DominantColor::getShare).reversed()
                .thenComparing(AiMediaAnalysis.DominantColor::getHex));
        return colors;
    }

    private static int nearest(double[] p, List<double[]> centres) {
        int best = 0;
        double bestDistance = Double.MAX_VALUE;
        for (int c = 0; c < centres.size(); c++) {
            double d = distance(p, centres.get(c));
            if (d < bestDistance) {
                bestDistance = d;
                best = c;
            }
        }
        return best;
    }

    private static double nearestDistance(double[] p, List<double[]> centres) {
        double best = Double.MAX_VALUE;
        for (double[] centre : centres) {
            best = Math.min(best, distance(p, centre));
        }
        return best;
    }

    private static double distance(double[] a, double[] b) {
        double dr = a[0] - b[0];
        double dg = a[1] - b[1];
        double db = a[2] - b[2];
        return dr * dr + dg * dg + db * db;
    }

    private static String hex(double[] rgb) {
        return String.format(Locale.ROOT, "#%02x%02x%02x", channel(rgb[0]), channel(rgb[1]), channel(rgb[2]));
    }

    private static int channel(double value) {
        return (int) Math.max(0, Math.min(255, Math.round(value)));
    }

    static double round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}
