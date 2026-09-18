package com.example.zelqanepfe.service.ai.media;

import lombok.extern.slf4j.Slf4j;
import org.jcodec.api.FrameGrab;
import org.jcodec.common.DemuxerTrack;
import org.jcodec.common.DemuxerTrackMeta;
import org.jcodec.common.io.NIOUtils;
import org.jcodec.common.io.SeekableByteChannel;
import org.jcodec.common.model.Picture;
import org.jcodec.common.model.Size;
import org.jcodec.containers.mp4.demuxer.MP4Demuxer;
import org.jcodec.scale.AWTUtil;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Container metadata and key frames of an MP4 video with JCodec, pure Java (docs/round2-contract.md §2.3).
 * WebM is reported as unsupported. Never throws: a failure yields a probe without frames.
 */
@Slf4j
public class VideoFrameExtractor {

    public static final String LABEL_START = "DEBUT";
    public static final String LABEL_MIDDLE = "MILIEU";
    public static final String LABEL_END = "FIN";

    /** One decoded frame. */
    public record Frame(String label, double positionSeconds, BufferedImage image) {
    }

    /**
     * @param supported       false for a WebM (or any non-MP4) file
     * @param durationSeconds container duration in seconds (fractional), null when unreadable
     */
    public record VideoProbe(boolean supported, Double durationSeconds, Integer width, Integer height, List<Frame> frames) {

        public static VideoProbe unsupported() {
            return new VideoProbe(false, null, null, null, List.of());
        }

        public static VideoProbe unreadable() {
            return new VideoProbe(true, null, null, null, List.of());
        }

        public Integer roundedDurationSeconds() {
            return durationSeconds == null ? null : (int) Math.ceil(durationSeconds - 1e-9);
        }

        public Frame middleFrame() {
            return frames.stream().filter(f -> LABEL_MIDDLE.equals(f.label())).findFirst()
                    .orElse(frames.isEmpty() ? null : frames.get(frames.size() / 2));
        }
    }

    private final int timeoutSeconds;

    public VideoFrameExtractor(int timeoutSeconds) {
        this.timeoutSeconds = Math.max(1, timeoutSeconds);
    }

    public static boolean isMp4(String mimeType, String fileName) {
        String mime = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT);
        String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (mime.contains("webm") || name.endsWith(".webm")) {
            return false;
        }
        return mime.equals("video/mp4") || mime.equals("video/quicktime") || name.endsWith(".mp4") || name.endsWith(".m4v")
                || (mime.isEmpty() && !name.contains("."));
    }

    public VideoProbe extract(Path file, String mimeType, String fileName) {
        if (!isMp4(mimeType, fileName)) {
            return VideoProbe.unsupported();
        }
        if (file == null || !Files.isRegularFile(file)) {
            return VideoProbe.unreadable();
        }
        ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "zelqane-video-frames");
            thread.setDaemon(true);
            return thread;
        });
        Future<VideoProbe> future = executor.submit(() -> read(file));
        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException ex) {
            future.cancel(true);
            log.warn("Extraction des images de la vidéo {} trop longue (> {} s)", fileName, timeoutSeconds);
            return VideoProbe.unreadable();
        } catch (ExecutionException ex) {
            log.warn("Lecture de la vidéo {} impossible : {}", fileName, String.valueOf(ex.getCause()));
            return VideoProbe.unreadable();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            return VideoProbe.unreadable();
        } finally {
            executor.shutdownNow();
        }
    }

    /** Positions t = 0, duration / 2 and max(0, duration − 0.5). */
    public static double[] framePositions(double duration) {
        double safe = Math.max(0, duration);
        return new double[]{0, safe / 2d, Math.max(0, safe - 0.5)};
    }

    private static VideoProbe read(Path file) throws Exception {
        Double duration = null;
        Integer width = null;
        Integer height = null;
        try (SeekableByteChannel channel = NIOUtils.readableChannel(file.toFile())) {
            MP4Demuxer demuxer = MP4Demuxer.createMP4Demuxer(channel);
            DemuxerTrack track = demuxer.getVideoTrack();
            if (track == null) {
                return VideoProbe.unreadable();
            }
            DemuxerTrackMeta meta = track.getMeta();
            if (meta != null) {
                duration = meta.getTotalDuration() > 0 ? meta.getTotalDuration() : null;
                if (meta.getVideoCodecMeta() != null && meta.getVideoCodecMeta().getSize() != null) {
                    Size size = meta.getVideoCodecMeta().getSize();
                    width = size.getWidth();
                    height = size.getHeight();
                }
            }
        }
        List<Frame> frames = new ArrayList<>();
        if (duration != null) {
            String[] labels = {LABEL_START, LABEL_MIDDLE, LABEL_END};
            double[] positions = framePositions(duration);
            for (int i = 0; i < positions.length && !Thread.currentThread().isInterrupted(); i++) {
                BufferedImage image = grab(file, positions[i]);
                if (image != null) {
                    frames.add(new Frame(labels[i], Math.round(positions[i] * 100d) / 100d, image));
                }
            }
        }
        if ((width == null || height == null) && !frames.isEmpty()) {
            width = frames.get(0).image().getWidth();
            height = frames.get(0).image().getHeight();
        }
        return new VideoProbe(true, duration, width, height, frames);
    }

    private static BufferedImage grab(Path file, double second) {
        try (SeekableByteChannel channel = NIOUtils.readableChannel(file.toFile())) {
            FrameGrab grab = FrameGrab.createFrameGrab(channel);
            grab.seekToSecondPrecise(second);
            Picture picture = grab.getNativeFrame();
            return picture == null ? null : AWTUtil.toBufferedImage(picture);
        } catch (Exception | LinkageError ex) {
            return null;
        }
    }
}
