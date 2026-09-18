package com.example.zelqanepfe.service.ai.media;

import com.example.zelqanepfe.model.AiIssueSource;
import com.example.zelqanepfe.model.MediaFileType;
import com.example.zelqanepfe.service.ai.ContentAnalysisPipeline;
import com.example.zelqanepfe.service.ai.MediaInput;
import com.example.zelqanepfe.service.ai.SimulatedOcrService;
import org.jcodec.api.awt.AWTSequenceEncoder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class VideoFrameExtractorTest {

    @TempDir
    static Path dir;

    static Path video;

    /** 3 s, 5 fps, 320×180 H.264 MP4 encoded with JCodec (no ffmpeg needed). */
    @BeforeAll
    static void encodeVideo() throws Exception {
        video = dir.resolve("clip.mp4");
        AWTSequenceEncoder encoder = AWTSequenceEncoder.createSequenceEncoder(video.toFile(), 5);
        for (int i = 0; i < 15; i++) {
            BufferedImage frame = new BufferedImage(320, 180, BufferedImage.TYPE_3BYTE_BGR);
            Graphics2D g = frame.createGraphics();
            g.setColor(new Color(30 + i * 10, 80, 160));
            g.fillRect(0, 0, 320, 180);
            g.setColor(Color.WHITE);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 28));
            g.drawString("PROMO " + i, 40 + i * 4, 100);
            g.dispose();
            encoder.encodeImage(frame);
        }
        encoder.finish();
    }

    @Test
    void readsContainerMetadataAndThreeFrames() {
        VideoFrameExtractor.VideoProbe probe = new VideoFrameExtractor(20).extract(video, "video/mp4", "clip.mp4");

        assertThat(probe.supported()).isTrue();
        assertThat(probe.durationSeconds()).isBetween(2.5, 3.5);
        assertThat(probe.roundedDurationSeconds()).isEqualTo(3);
        assertThat(probe.width()).isEqualTo(320);
        assertThat(probe.height()).isEqualTo(180);
        assertThat(probe.frames()).extracting(VideoFrameExtractor.Frame::label).containsExactly("DEBUT", "MILIEU", "FIN");
        assertThat(probe.frames().get(1).positionSeconds()).isEqualTo(probe.durationSeconds() / 2, org.assertj.core.data.Offset.offset(0.01));
        assertThat(probe.middleFrame().image().getWidth()).isEqualTo(320);
    }

    @Test
    void webmAndUnreadableFilesNeverThrow() throws Exception {
        assertThat(new VideoFrameExtractor(5).extract(video, "video/webm", "clip.webm").supported()).isFalse();
        Path garbage = Files.writeString(dir.resolve("broken.mp4"), "not a video at all");
        VideoFrameExtractor.VideoProbe broken = new VideoFrameExtractor(5).extract(garbage, "video/mp4", "broken.mp4");
        assertThat(broken.supported()).isTrue();
        assertThat(broken.frames()).isEmpty();
        assertThat(broken.durationSeconds()).isNull();
        assertThat(VideoFrameExtractor.framePositions(0.3)).containsExactly(0, 0.15, 0);
    }

    @Test
    void pipelineAnalysesFramesWritesThumbnailAndChecksDuration() throws Exception {
        List<String> thumbnails = new ArrayList<>();
        ThumbnailStore store = (campaignId, mediaId, mediaFile, frame) -> {
            String path = ThumbnailStore.relativePath(campaignId, mediaId);
            Path target = dir.resolve(path);
            try {
                Files.createDirectories(target.getParent());
                Files.write(target, JpegEncoder.encode(JpegEncoder.fitWidth(frame, ThumbnailStore.MAX_WIDTH)));
            } catch (java.io.IOException ex) {
                throw new java.io.UncheckedIOException(ex);
            }
            thumbnails.add(path);
            return path;
        };
        ContentAnalysisPipeline pipeline = new ContentAnalysisPipeline(new SimulatedOcrService(),
                new VideoFrameExtractor(20), store, 512);
        MediaInput media = new MediaInput(12L, "soldes-ete.mp4", MediaFileType.VIDEO, "video/mp4", 80_000L, 10, null,
                null, null, video);

        var outcome = pipeline.analyze(new ContentAnalysisPipeline.AnalysisInput("Soldes d'été",
                "Découvrez nos soldes d'été dans toutes nos boutiques de Tunis et de Sousse.", new BigDecimal("400"),
                List.of(media), List.of(), List.of(), 7L, null));

        var analysis = outcome.mediaAnalyses().get(0);
        assertThat(analysis.getVideoSupported()).isTrue();
        assertThat(analysis.getContainerDurationSeconds()).isEqualTo(3);
        assertThat(analysis.getWidthPx()).isEqualTo(320);
        assertThat(analysis.getFrames()).hasSize(3);
        assertThat(analysis.getFrames()).allSatisfy(frame -> assertThat(frame.getMetrics()).isNotNull());
        assertThat(analysis.getMetrics()).isNotNull();
        assertThat(analysis.getThumbnailPath()).isEqualTo("campaigns/7/thumbs/12.jpg");
        assertThat(thumbnails).containsExactly("campaigns/7/thumbs/12.jpg");
        assertThat(ImageIO.read(dir.resolve(thumbnails.get(0)).toFile()).getWidth()).isEqualTo(320);
        // declared 10 s vs 3 s in the container
        assertThat(outcome.issueLabels()).contains(ContentAnalysisPipeline.DURATION_MISMATCH, ImageAnalyzer.LOW_RESOLUTION);
        assertThat(outcome.issues()).filteredOn(i -> i.getLabel().equals(ImageAnalyzer.LOW_RESOLUTION))
                .extracting(i -> i.getSource()).containsExactly(AiIssueSource.VIDEO);
        // simulated OCR on frames: one text for the three frames
        assertThat(outcome.extractedText()).isEqualTo("soldes ete");
        assertThat(analysis.getFrames().get(0).getExtractedText()).isEqualTo("soldes ete");
    }
}
