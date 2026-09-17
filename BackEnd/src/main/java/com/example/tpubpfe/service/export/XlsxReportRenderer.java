package com.example.tpubpfe.service.export;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Excel workbook of a {@link ReportModel} (docs/round2-contract.md §5.6): typed cells, French formats, and no
 * formula is ever written (a text starting with {@code = + - @} is quote-prefixed).
 */
@Component
public class XlsxReportRenderer {

    private static final int MAX_COLUMN_CHARS = 60;

    public byte[] render(ReportModel model, ZoneId zone) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle header = headerStyle(workbook);
            CellStyle money = numberStyle(workbook, "#,##0.00 \"TND\"");
            CellStyle count = numberStyle(workbook, "#,##0");
            CellStyle date = numberStyle(workbook, "dd/mm/yyyy");
            CellStyle quoted = workbook.createCellStyle();
            quoted.setQuotePrefixed(true);

            Sheet summary = workbook.createSheet("Synthèse");
            int rowIndex = 0;
            Row title = summary.createRow(rowIndex++);
            title.createCell(0).setCellValue(model.title());
            title.getCell(0).setCellStyle(header);
            summary.createRow(rowIndex++).createCell(0).setCellValue(model.periodLabel());
            summary.createRow(rowIndex++).createCell(0).setCellValue("Généré le "
                    + ExportFormats.FRENCH_DATE_TIME.format(model.generatedAt().atZone(zone)));
            rowIndex++;
            Row kpiHeader = summary.createRow(rowIndex++);
            kpiHeader.createCell(0).setCellValue("Indicateur");
            kpiHeader.createCell(1).setCellValue("Valeur");
            kpiHeader.getCell(0).setCellStyle(header);
            kpiHeader.getCell(1).setCellStyle(header);
            for (ReportModel.Kpi kpi : model.kpis()) {
                Row row = summary.createRow(rowIndex++);
                writeText(row.createCell(0), kpi.label(), quoted);
                writeText(row.createCell(1), kpi.unit() == null ? kpi.value() : kpi.value() + " " + kpi.unit(), quoted);
            }
            autosize(summary, 2);

            Set<String> names = new HashSet<>();
            for (ReportModel.Table table : model.tables()) {
                Sheet sheet = workbook.createSheet(uniqueName(names, table.name()));
                Row headerRow = sheet.createRow(0);
                for (int c = 0; c < table.headers().size(); c++) {
                    Cell cell = headerRow.createCell(c);
                    cell.setCellValue(table.headers().get(c));
                    cell.setCellStyle(header);
                }
                int r = 1;
                for (List<ReportModel.Cell> values : table.rows()) {
                    Row row = sheet.createRow(r++);
                    for (int c = 0; c < values.size(); c++) {
                        write(row.createCell(c), values.get(c), money, count, date, quoted);
                    }
                }
                sheet.createFreezePane(0, 1);
                autosize(sheet, table.headers().size());
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void write(Cell cell, ReportModel.Cell value, CellStyle money, CellStyle count, CellStyle date,
                              CellStyle quoted) {
        if (value.date() != null) {
            cell.setCellValue(java.sql.Date.valueOf(value.date()));
            cell.setCellStyle(date);
            return;
        }
        if (value.number() != null) {
            cell.setCellValue(value.number().doubleValue());
            cell.setCellStyle(value.money() ? money : count);
            return;
        }
        writeText(cell, value.text(), quoted);
    }

    /** Never {@code setCellFormula}: a text starting with {@code = + - @} is written quote-prefixed. */
    private static void writeText(Cell cell, String text, CellStyle quoted) {
        String value = text == null ? "" : text;
        if (ExportFormats.needsQuotePrefix(value)) {
            cell.setCellStyle(quoted);
        }
        cell.setCellValue(value);
    }

    private static CellStyle headerStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        style.setAlignment(HorizontalAlignment.LEFT);
        return style;
    }

    private static CellStyle numberStyle(Workbook workbook, String format) {
        CellStyle style = workbook.createCellStyle();
        style.setDataFormat(workbook.createDataFormat().getFormat(format));
        return style;
    }

    private static void autosize(Sheet sheet, int columns) {
        for (int c = 0; c < columns; c++) {
            sheet.autoSizeColumn(c);
            int width = Math.min(sheet.getColumnWidth(c), MAX_COLUMN_CHARS * 256);
            sheet.setColumnWidth(c, Math.max(width, 10 * 256));
        }
    }

    /** Excel sheet names are unique, at most 31 characters, without {@code []:*?/\}. */
    static String uniqueName(Set<String> used, String name) {
        String clean = name.replaceAll("[\\[\\]:*?/\\\\]", " ").trim();
        if (clean.isEmpty()) {
            clean = "Données";
        }
        if (clean.length() > 31) {
            clean = clean.substring(0, 31);
        }
        String candidate = clean;
        int suffix = 2;
        while (!used.add(candidate)) {
            String base = clean.length() > 28 ? clean.substring(0, 28) : clean;
            candidate = base + " " + suffix++;
        }
        return candidate;
    }
}
