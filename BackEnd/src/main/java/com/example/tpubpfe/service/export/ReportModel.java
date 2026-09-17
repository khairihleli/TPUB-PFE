package com.example.tpubpfe.service.export;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Renderer-neutral report (docs/round2-contract.md §5.6): the PDF and the Excel workbook read this model, the CSV
 * keeps its own format.
 */
public record ReportModel(String title, String subtitle, String periodLabel, Instant generatedAt,
                          List<Kpi> kpis, List<Table> tables, Long imageMediaId, String fileBaseName) {

    /** One figure of the summary grid. */
    public record Kpi(String label, String value, String unit) {
    }

    /** One sheet of the workbook, one block of the PDF. */
    public record Table(String name, List<String> headers, List<List<Cell>> rows) {
    }

    /** Typed cell: numbers and dates keep their type in the workbook, text is quote-prefixed when needed. */
    public record Cell(String text, BigDecimal number, LocalDate date, boolean money) {

        public static Cell text(String value) {
            return new Cell(value == null ? "" : value, null, null, false);
        }

        public static Cell count(long value) {
            return new Cell(Long.toString(value), BigDecimal.valueOf(value), null, false);
        }

        public static Cell money(BigDecimal value) {
            BigDecimal amount = value == null ? BigDecimal.ZERO : value;
            return new Cell(amount.toPlainString(), amount, null, true);
        }

        public static Cell date(LocalDate value) {
            return new Cell(value == null ? "" : value.toString(), null, value, false);
        }
    }
}
