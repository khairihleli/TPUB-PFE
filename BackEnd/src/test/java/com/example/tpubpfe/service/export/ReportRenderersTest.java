package com.example.tpubpfe.service.export;

import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** PDF and Excel renderers of the statistics exports (docs/round2-contract.md §5.6). */
class ReportRenderersTest {

    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    private static final Instant GENERATED = LocalDate.of(2026, 9, 16).atTime(14, 30).atZone(TUNIS).toInstant();

    private static ReportModel model(int dayCount) {
        List<List<ReportModel.Cell>> rows = new ArrayList<>();
        for (int i = 0; i < dayCount; i++) {
            rows.add(List.of(ReportModel.Cell.date(LocalDate.of(2026, 9, 1).plusDays(i)),
                    ReportModel.Cell.count(120 + i), ReportModel.Cell.money(new BigDecimal("12.500"))));
        }
        List<List<ReportModel.Cell>> campaigns = List.of(
                List.of(ReportModel.Cell.text("=CMD()|'/C calc'!A1"), ReportModel.Cell.count(3)),
                List.of(ReportModel.Cell.text("Boutique Ariana"), ReportModel.Cell.count(7)));
        return new ReportModel("Statistiques de diffusion", "Réseau TPUB", "Du 01/09/2026 au 30/09/2026", GENERATED,
                List.of(new ReportModel.Kpi("Affichages", "1 240", null),
                        new ReportModel.Kpi("Coût", "312,500", "TND")),
                List.of(new ReportModel.Table("Par jour", List.of("Date", "Affichages", "Coût (TND)"), rows),
                        new ReportModel.Table("Par campagne", List.of("Campagne", "Affichages"), campaigns)),
                null, "views-2026-09-01-2026-09-30");
    }

    @Test
    void pdfCarriesTheHeaderTheKpisAndEveryTable() throws Exception {
        byte[] pdf = new PdfReportRenderer().render(model(3), null, TUNIS);

        PdfReader reader = new PdfReader(pdf);
        String text = new PdfTextExtractor(reader).getTextFromPage(1);
        assertThat(reader.getNumberOfPages()).isEqualTo(1);
        assertThat(text).contains("TPUB").contains("Statistiques de diffusion")
                .contains("Du 01/09/2026 au 30/09/2026").contains("Généré le 16/09/2026 14:30")
                .contains("Par jour").contains("Par campagne").contains("Estimations internes TPUB");
        reader.close();
    }

    @Test
    void aLongPdfIsPaginated() throws Exception {
        byte[] pdf = new PdfReportRenderer().render(model(120), null, TUNIS);
        PdfReader reader = new PdfReader(pdf);
        assertThat(reader.getNumberOfPages()).isGreaterThan(1);
        // The table header is repeated on every page.
        assertThat(new PdfTextExtractor(reader).getTextFromPage(2)).contains("Affichages");
        reader.close();
    }

    @Test
    void charactersOutsideCp1252BecomeQuestionMarks() {
        assertThat(ExportFormats.toCp1252("Écran « test » — é")).isEqualTo("Écran « test » — é");
        assertThat(ExportFormats.toCp1252("مرحبا")).isEqualTo("?????");
        assertThat(ExportFormats.toCp1252(null)).isEmpty();
    }

    @Test
    void workbookHasOneSheetPerTableWithTypedCells() throws Exception {
        byte[] xlsx = new XlsxReportRenderer().render(model(2), TUNIS);

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            assertThat(workbook.getNumberOfSheets()).isEqualTo(3);
            assertThat(workbook.getSheetAt(0).getSheetName()).isEqualTo("Synthèse");
            Sheet days = workbook.getSheet("Par jour");
            assertThat(days).isNotNull();
            assertThat(days.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Date");
            Cell views = days.getRow(1).getCell(1);
            assertThat(views.getCellType()).isEqualTo(CellType.NUMERIC);
            assertThat(views.getNumericCellValue()).isEqualTo(120d);
            assertThat(days.getRow(1).getCell(2).getNumericCellValue()).isEqualTo(12.5d);
            assertThat(days.getPaneInformation().isFreezePane()).isTrue();

            Sheet campaigns = workbook.getSheet("Par campagne");
            Cell malicious = campaigns.getRow(1).getCell(0);
            assertThat(malicious.getCellType()).isEqualTo(CellType.STRING);
            assertThat(malicious.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(campaigns.getRow(2).getCell(0).getCellStyle().getQuotePrefixed()).isFalse();
        }
    }

    @Test
    void sheetNamesAreUniqueAndShortEnough() {
        java.util.Set<String> used = new java.util.HashSet<>();
        assertThat(XlsxReportRenderer.uniqueName(used, "Par jour")).isEqualTo("Par jour");
        assertThat(XlsxReportRenderer.uniqueName(used, "Par jour")).isEqualTo("Par jour 2");
        assertThat(XlsxReportRenderer.uniqueName(used, "Par [zone]:/")).isEqualTo("Par  zone");
        assertThat(XlsxReportRenderer.uniqueName(used, "x".repeat(40))).hasSize(31);
    }

    @Test
    void formulaTriggersAreDetected() {
        assertThat(ExportFormats.needsQuotePrefix("=1+1")).isTrue();
        assertThat(ExportFormats.needsQuotePrefix("+33")).isTrue();
        assertThat(ExportFormats.needsQuotePrefix("-5")).isTrue();
        assertThat(ExportFormats.needsQuotePrefix("@zone")).isTrue();
        assertThat(ExportFormats.needsQuotePrefix("Campagne")).isFalse();
        assertThat(ExportFormats.needsQuotePrefix("")).isFalse();
        assertThat(ExportFormats.needsQuotePrefix(null)).isFalse();
    }
}
