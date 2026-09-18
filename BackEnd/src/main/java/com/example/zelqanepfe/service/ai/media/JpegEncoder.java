package com.example.zelqanepfe.service.ai.media;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Iterator;

/** JPEG encoding with a bounded size, for thumbnails (≤ 480 px wide) and provider images (≤ 1024 px). */
public final class JpegEncoder {

    public static final float QUALITY = 0.85f;

    private JpegEncoder() {
    }

    /** Resizes so the width is at most {@code maxWidth} (aspect preserved). */
    public static BufferedImage fitWidth(BufferedImage source, int maxWidth) {
        double factor = Math.min(1d, (double) maxWidth / source.getWidth());
        return resize(source, factor);
    }

    /** Resizes so the longest side is at most {@code maxSide} (aspect preserved). */
    public static BufferedImage fitLongestSide(BufferedImage source, int maxSide) {
        double factor = Math.min(1d, (double) maxSide / Math.max(source.getWidth(), source.getHeight()));
        return resize(source, factor);
    }

    public static byte[] encode(BufferedImage image) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        write(image, out);
        return out.toByteArray();
    }

    public static void write(BufferedImage image, OutputStream out) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IOException("Aucun encodeur JPEG disponible");
        }
        ImageWriter writer = writers.next();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(QUALITY);
            writer.write(null, new IIOImage(toRgb(image), null, null), param);
        } finally {
            writer.dispose();
        }
    }

    private static BufferedImage resize(BufferedImage source, double factor) {
        int w = Math.max(1, (int) Math.round(source.getWidth() * factor));
        int h = Math.max(1, (int) Math.round(source.getHeight() * factor));
        if (factor >= 1d && source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }
        BufferedImage target = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(source, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    private static BufferedImage toRgb(BufferedImage image) {
        return image.getType() == BufferedImage.TYPE_INT_RGB ? image : resize(image, 1d);
    }
}
