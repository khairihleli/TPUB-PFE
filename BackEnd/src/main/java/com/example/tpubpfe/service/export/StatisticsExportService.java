package com.example.tpubpfe.service.export;

import com.example.tpubpfe.model.MediaFile;
import com.example.tpubpfe.repository.MediaFileRepository;
import com.example.tpubpfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;

/** PDF and Excel exports of the statistics (docs/round2-contract.md §5.6). */
@Slf4j
@Service
@RequiredArgsConstructor
public class StatisticsExportService {

    /** Largest visual embedded in a PDF (a bigger file is skipped rather than blowing up the document). */
    static final long MAX_IMAGE_BYTES = 8L * 1024 * 1024;

    public record ExportFile(String filename, byte[] content) {
    }

    private final ReportModelBuilder builder;
    private final PdfReportRenderer pdfRenderer;
    private final XlsxReportRenderer xlsxRenderer;
    private final MediaFileRepository mediaFileRepository;
    private final FileStorageService storage;
    private final Clock clock;

    @Transactional(readOnly = true)
    public ExportFile pdf(String type, LocalDate from, LocalDate to, String groupBy, Long campaignId) {
        ReportModel model = builder.build(type, from, to, groupBy, campaignId);
        byte[] image = model.imageMediaId() == null ? null : readMedia(model.imageMediaId());
        return new ExportFile(filename(model, "pdf"), pdfRenderer.render(model, image, clock.getZone()));
    }

    @Transactional(readOnly = true)
    public ExportFile xlsx(String type, LocalDate from, LocalDate to, String groupBy, Long campaignId) {
        ReportModel model = builder.build(type, from, to, groupBy, campaignId);
        return new ExportFile(filename(model, "xlsx"), xlsxRenderer.render(model, clock.getZone()));
    }

    /** Media are read from disk by id, never through HTTP (docs/round2-contract.md §1.2). */
    private byte[] readMedia(Long mediaId) {
        MediaFile media = mediaFileRepository.findById(mediaId).orElse(null);
        if (media == null || media.getFilePath() == null) {
            return null;
        }
        try {
            Path path = storage.resolve(media.getFilePath());
            if (path == null || !Files.isRegularFile(path) || Files.size(path) > MAX_IMAGE_BYTES) {
                return null;
            }
            return Files.readAllBytes(path);
        } catch (IOException | RuntimeException e) {
            log.warn("Visuel {} illisible pour l'export PDF : {}", mediaId, e.getMessage());
            return null;
        }
    }

    static String filename(ReportModel model, String extension) {
        return "tpub-statistiques-" + model.fileBaseName() + "." + extension;
    }
}
