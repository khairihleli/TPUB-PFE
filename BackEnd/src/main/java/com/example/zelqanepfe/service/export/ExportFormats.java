package com.example.zelqanepfe.service.export;

import java.time.format.DateTimeFormatter;

/** Shared formats of the PDF and Excel renderers (docs/round2-contract.md §5.6). */
public final class ExportFormats {

    public static final DateTimeFormatter FRENCH_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    public static final DateTimeFormatter FRENCH_DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    /** Excel cell text that a spreadsheet would evaluate as a formula. */
    private static final String FORMULA_TRIGGERS = "=+-@\t\r";

    private ExportFormats() {
    }

    /** True when the text must be written as a quote-prefixed string cell (formula injection). */
    public static boolean needsQuotePrefix(String value) {
        return value != null && !value.isEmpty() && FORMULA_TRIGGERS.indexOf(value.charAt(0)) >= 0;
    }

    /**
     * Helvetica of the PDF is Cp1252: characters outside that page (Arabic, emoji) become « ? » so the document
     * never fails to render.
     */
    public static String toCp1252(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(value.length());
        for (char c : value.toCharArray()) {
            out.append(c < 256 || "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".indexOf(c) >= 0 ? c : '?');
        }
        return out.toString();
    }
}
