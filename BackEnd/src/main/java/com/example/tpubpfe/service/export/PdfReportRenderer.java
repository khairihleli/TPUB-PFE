package com.example.tpubpfe.service.export;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.util.List;

/** A4 PDF of a {@link ReportModel} (docs/round2-contract.md §5.6), rendered with OpenPDF. */
@Slf4j
@Component
public class PdfReportRenderer {

    private static final Color BRAND = new Color(31, 55, 92);
    private static final Color LINE = new Color(214, 219, 228);
    private static final float IMAGE_HEIGHT_MM = 60f;

    /** @param image optional visual of a campaign report (already read from disk), {@code null} when unavailable */
    public byte[] render(ReportModel model, byte[] image, ZoneId zone) {
        Document document = new Document(PageSize.A4, 42, 42, 54, 48);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(document, out);
        writer.setPageEvent(new Footer());
        document.open();
        Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, BRAND);
        Font subtitleFont = FontFactory.getFont(FontFactory.HELVETICA, 10, Color.DARK_GRAY);
        document.add(paragraph("TPUB — Tukhnanutha", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, BRAND)));
        document.add(paragraph(model.title(), titleFont));
        if (model.subtitle() != null && !model.subtitle().isBlank()) {
            document.add(paragraph(model.subtitle(), subtitleFont));
        }
        document.add(paragraph(model.periodLabel(), subtitleFont));
        document.add(paragraph("Généré le "
                + ExportFormats.FRENCH_DATE_TIME.format(model.generatedAt().atZone(zone)), subtitleFont));
        document.add(new Paragraph(" "));
        if (!model.kpis().isEmpty()) {
            document.add(kpiGrid(model.kpis()));
            document.add(new Paragraph(" "));
        }
        if (image != null) {
            try {
                Image visual = Image.getInstance(image);
                float height = IMAGE_HEIGHT_MM * 72f / 25.4f;
                visual.scaleToFit(document.getPageSize().getWidth() - 100f, height);
                visual.setAlignment(Element.ALIGN_CENTER);
                document.add(visual);
                document.add(new Paragraph(" "));
            } catch (Exception e) {
                log.warn("Visuel illisible dans le rapport PDF : {}", e.getMessage());
            }
        }
        for (ReportModel.Table table : model.tables()) {
            if (table.rows().isEmpty()) {
                continue;
            }
            document.add(paragraph(table.name(), FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, BRAND)));
            document.add(table(table));
            document.add(new Paragraph(" "));
        }
        document.close();
        return out.toByteArray();
    }

    private static Paragraph paragraph(String text, Font font) {
        Paragraph paragraph = new Paragraph(ExportFormats.toCp1252(text), font);
        paragraph.setSpacingAfter(4f);
        return paragraph;
    }

    private static PdfPTable kpiGrid(List<ReportModel.Kpi> kpis) {
        PdfPTable grid = new PdfPTable(Math.min(4, Math.max(1, kpis.size())));
        grid.setWidthPercentage(100);
        Font label = FontFactory.getFont(FontFactory.HELVETICA, 8, Color.DARK_GRAY);
        Font value = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13, BRAND);
        for (ReportModel.Kpi kpi : kpis) {
            PdfPCell cell = new PdfPCell();
            cell.setBorderColor(LINE);
            cell.setPadding(8f);
            cell.addElement(new Paragraph(ExportFormats.toCp1252(kpi.label()), label));
            cell.addElement(new Paragraph(ExportFormats.toCp1252(
                    kpi.unit() == null ? kpi.value() : kpi.value() + " " + kpi.unit()), value));
            grid.addCell(cell);
        }
        int missing = (grid.getNumberOfColumns() - kpis.size() % grid.getNumberOfColumns())
                % grid.getNumberOfColumns();
        for (int i = 0; i < missing; i++) {
            PdfPCell empty = new PdfPCell(new Phrase(""));
            empty.setBorder(Rectangle.NO_BORDER);
            grid.addCell(empty);
        }
        return grid;
    }

    private static PdfPTable table(ReportModel.Table table) {
        PdfPTable pdfTable = new PdfPTable(table.headers().size());
        pdfTable.setWidthPercentage(100);
        pdfTable.setHeaderRows(1);
        Font headerFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.WHITE);
        Font cellFont = FontFactory.getFont(FontFactory.HELVETICA, 9, Color.BLACK);
        for (String header : table.headers()) {
            PdfPCell cell = new PdfPCell(new Phrase(ExportFormats.toCp1252(header), headerFont));
            cell.setBackgroundColor(BRAND);
            cell.setBorderColor(LINE);
            cell.setPadding(5f);
            pdfTable.addCell(cell);
        }
        for (List<ReportModel.Cell> row : table.rows()) {
            for (ReportModel.Cell value : row) {
                PdfPCell cell = new PdfPCell(new Phrase(ExportFormats.toCp1252(text(value)), cellFont));
                cell.setBorderColor(LINE);
                cell.setPadding(4f);
                if (value.number() != null) {
                    cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
                }
                pdfTable.addCell(cell);
            }
        }
        return pdfTable;
    }

    static String text(ReportModel.Cell cell) {
        if (cell.date() != null) {
            return ExportFormats.FRENCH_DATE.format(cell.date());
        }
        if (cell.money() && cell.number() != null) {
            return cell.number().setScale(3, java.math.RoundingMode.HALF_UP).toPlainString().replace('.', ',');
        }
        return cell.text();
    }

    /** « Page n / N · Estimations internes TPUB ». */
    private static final class Footer extends PdfPageEventHelper {

        private com.lowagie.text.pdf.PdfTemplate total;

        @Override
        public void onOpenDocument(PdfWriter writer, Document document) {
            total = writer.getDirectContent().createTemplate(50, 12);
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            Font font = FontFactory.getFont(FontFactory.HELVETICA, 8, Color.GRAY);
            Phrase phrase = new Phrase("Page " + writer.getPageNumber() + " / ", font);
            float x = document.left();
            float y = document.bottom() - 18;
            com.lowagie.text.pdf.ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_LEFT, phrase, x, y, 0);
            writer.getDirectContent().addTemplate(total, x + phrase.getContent().length() * 3.6f, y);
            com.lowagie.text.pdf.ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_RIGHT,
                    new Phrase("Estimations internes TPUB", font), document.right(), y, 0);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            total.beginText();
            try {
                total.setFontAndSize(com.lowagie.text.pdf.BaseFont.createFont(
                        com.lowagie.text.pdf.BaseFont.HELVETICA, com.lowagie.text.pdf.BaseFont.WINANSI, false), 8);
            } catch (DocumentException | java.io.IOException e) {
                log.debug("Police du pied de page indisponible : {}", e.getMessage());
            }
            total.setColorFill(Color.GRAY);
            total.showText(String.valueOf(writer.getPageNumber()));
            total.endText();
        }
    }
}
