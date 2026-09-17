package com.example.tpubpfe.service;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.dto.MediaFileResponse;
import com.example.tpubpfe.exception.ApiException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.ClientValidationStatus;
import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.model.MediaFileType;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MediaServiceTest {

    @TempDir
    Path uploadDir;

    private MediaFileRepository repository;
    private CampaignAccessGuard guard;
    private TpubProperties properties;
    private MediaService service;
    private Campaign campaign;

    @BeforeEach
    void setUp() {
        repository = mock(MediaFileRepository.class);
        guard = mock(CampaignAccessGuard.class);
        properties = new TpubProperties();
        properties.getMedia().setUploadDir(uploadDir.toString());
        properties.getMedia().setBaseUrl("/uploads");
        service = new MediaService(repository, guard, new FileStorageService(properties), properties);
        campaign = Campaign.builder().id(12L).status(CampaignStatus.BROUILLON)
                .client(Client.builder().id(1L).validationStatus(ClientValidationStatus.VALIDATED).build()).build();
        when(guard.owned(12L)).thenReturn(campaign);
        when(repository.save(any(MediaFile.class))).thenAnswer(inv -> {
            MediaFile media = inv.getArgument(0);
            media.setId(33L);
            return media;
        });
    }

    private static byte[] png(int width, int height) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    private static byte[] mp4() {
        byte[] bytes = new byte[64];
        byte[] head = {0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};
        System.arraycopy(head, 0, bytes, 0, head.length);
        return bytes;
    }

    private static String code(ApiException ex) {
        return ex.getCode();
    }

    @Test
    void storesImageWithChecksumDimensionsAndOrder() throws IOException {
        when(repository.countByCampaignId(12L)).thenReturn(2L);
        MockMultipartFile file = new MockMultipartFile("file", "C:\\photos\\Pizza-Margherita.png", "image/png", png(320, 180));

        MediaFileResponse response = service.upload(12L, file, "banner", null);

        assertThat(response.getFileType()).isEqualTo("BANNER");
        assertThat(response.getFileName()).isEqualTo("Pizza-Margherita.png");
        assertThat(response.getWidthPx()).isEqualTo(320);
        assertThat(response.getHeightPx()).isEqualTo(180);
        assertThat(response.getSortOrder()).isEqualTo(2);
        assertThat(response.getChecksum()).hasSize(64);
        assertThat(response.getUrl()).startsWith("/uploads/campaigns/12/").contains(".png?exp=").contains("&sig=");
        String path = response.getUrl().substring("/uploads/".length(), response.getUrl().indexOf('?'));
        Path stored = uploadDir.resolve(path);
        assertThat(Files.exists(stored)).isTrue();
    }

    @Test
    void storesVideoDuration() {
        MediaFileResponse response = service.upload(12L, new MockMultipartFile("file", "spot.mp4", "video/mp4", mp4()), null, 25);
        assertThat(response.getFileType()).isEqualTo("VIDEO");
        assertThat(response.getDurationSeconds()).isEqualTo(25);
        assertThat(response.getWidthPx()).isNull();
    }

    @Test
    void rejectsInvalidUploads() throws IOException {
        byte[] image = png(10, 10);
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.pdf", "application/pdf", image), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(code(ex)).isEqualTo("MEDIA_TYPE_UNSUPPORTED");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
                });
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.jpg", "image/jpeg", mp4()), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("MEDIA_CONTENT_MISMATCH"));
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.mp4", "video/mp4", image), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("MEDIA_CONTENT_MISMATCH"));
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.mp4", "video/mp4", mp4()), "banner", null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("VALIDATION_FAILED"));
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.mp4", "video/mp4", mp4()), null, 601))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("VALIDATION_FAILED"));

        properties.getMedia().setMaxImageBytes(50);
        byte[] big = Arrays.copyOf(image, 200);
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.png", "image/png", big), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(code(ex)).isEqualTo("MEDIA_TOO_LARGE");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
                });
        properties.getMedia().setMaxImageBytes(10_485_760L);

        when(repository.countByCampaignId(12L)).thenReturn(5L);
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.png", "image/png", image), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("MEDIA_LIMIT_REACHED"));

        campaign.setStatus(CampaignStatus.REVIEW_REQUIRED);
        assertThatThrownBy(() -> service.upload(12L, new MockMultipartFile("file", "a.png", "image/png", image), null, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("CAMPAIGN_NOT_EDITABLE"));
        assertThat(uploadDir.resolve("campaigns")).doesNotExist();
    }

    @Test
    void deleteRequiresMediaOfTheCampaign() {
        Campaign other = Campaign.builder().id(99L).build();
        when(repository.findById(5L)).thenReturn(java.util.Optional.of(MediaFile.builder().id(5L).campaign(other)
                .filePath("campaigns/99/x.png").fileType(MediaFileType.IMAGE).build()));
        assertThatThrownBy(() -> service.delete(12L, 5L))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(code(ex)).isEqualTo("MEDIA_NOT_FOUND"));
    }

    @Test
    void mimeHelpers() {
        assertThat(MediaService.normaliseMime("IMAGE/JPG; charset=binary")).isEqualTo("image/jpeg");
        assertThat(MediaService.originalName("", "png")).isEqualTo("media.png");
        assertThat(MediaService.resolveType(true, null)).isEqualTo(MediaFileType.IMAGE);
    }
}
