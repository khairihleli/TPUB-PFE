package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.StatisticsViewsResponse;
import com.example.tpubpfe.exception.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CsvExportServiceTest {

    private final StatisticsService statistics = mock(StatisticsService.class);
    private final CsvExportService service = new CsvExportService(statistics);

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    @Test
    void viewsByDayUseFrenchFormatBomSemicolonAndDecimalComma() {
        TestAuth.login(1L, "ADMINISTRATEUR");
        LocalDate from = LocalDate.of(2026, 9, 1);
        StatisticsViewsResponse views = StatisticsViewsResponse.builder()
                .from(from).to(from.plusDays(1)).groupBy("day")
                .rows(List.of(
                        StatisticsViewsResponse.Row.builder().key("2026-09-01").label("01/09").views(12).clicks(2)
                                .interactions(1).cost(new BigDecimal("0.0960")).build(),
                        StatisticsViewsResponse.Row.builder().key("2026-09-02").label("02/09").views(0)
                                .cost(BigDecimal.ZERO).build()))
                .totals(StatisticsViewsResponse.Totals.builder().views(12).clicks(2).interactions(1)
                        .cost(new BigDecimal("0.0960")).build())
                .build();
        when(statistics.views(any())).thenReturn(views);

        CsvExportService.CsvFile file = service.export(new CsvExportService.ExportQuery("views", from, from.plusDays(1), "day", null));

        String csv = new String(file.content(), StandardCharsets.UTF_8);
        assertThat(file.filename()).isEqualTo("tpub-statistiques-views-2026-09-01-2026-09-02.csv");
        assertThat(csv).startsWith("﻿Date;Affichages;Clics;Interactions;Coût (TND)\r\n");
        assertThat(csv).contains("01/09/2026;12;2;1;0,096\r\n").contains("02/09/2026;0;0;0;0,000\r\n")
                .endsWith("Total;12;2;1;0,096\r\n");
    }

    @Test
    void groupedViewsEscapeLabels() {
        TestAuth.login(1L, "SUPERVISEUR");
        StatisticsViewsResponse views = StatisticsViewsResponse.builder()
                .from(LocalDate.of(2026, 9, 1)).to(LocalDate.of(2026, 9, 30)).groupBy("campaign")
                .rows(List.of(StatisticsViewsResponse.Row.builder().key("4").label("Soldes; \"été\"").views(3)
                        .cost(new BigDecimal("12.5")).build()))
                .totals(StatisticsViewsResponse.Totals.builder().views(3).cost(new BigDecimal("12.5")).build())
                .build();
        when(statistics.views(any())).thenReturn(views);

        String csv = new String(service.export(new CsvExportService.ExportQuery("views", null, null, "campaign", null)).content(),
                StandardCharsets.UTF_8);

        assertThat(csv).contains("Campagne;Affichages;Clics;Interactions;Coût (TND)")
                .contains("\"Soldes; \"\"été\"\"\";3;0;0;12,500");
    }

    @Test
    void typeAndRoleAreChecked() {
        TestAuth.login(5L, "ANNONCEUR");
        assertThatThrownBy(() -> service.export(new CsvExportService.ExportQuery("dashboard", null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ACCESS_DENIED");
        assertThatThrownBy(() -> service.export(new CsvExportService.ExportQuery("pdf", null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EXPORT_TYPE_INVALID");
        assertThatThrownBy(() -> service.export(new CsvExportService.ExportQuery("campaign", null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MISSING_PARAMETER");
        TestAuth.login(1L, "OPERATEUR");
        assertThatThrownBy(() -> service.export(new CsvExportService.ExportQuery("mine", null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ACCESS_DENIED");
        verifyNoInteractions(statistics);
    }

    @Test
    void moneyAndEscapeHelpers() {
        assertThat(CsvExportService.money(new BigDecimal("1234.5678"))).isEqualTo("1234,568");
        assertThat(CsvExportService.money(null)).isEqualTo("0,000");
        assertThat(CsvExportService.escape("a\nb")).isEqualTo("\"a\nb\"");
        assertThat(CsvExportService.escape(null)).isEmpty();
    }

    @Test
    void escapeNeutralisesSpreadsheetFormulasButKeepsNumbers() {
        assertThat(CsvExportService.escape("=HYPERLINK(\"http://x\")")).isEqualTo("\"'=HYPERLINK(\"\"http://x\"\")\"");
        assertThat(CsvExportService.escape("+216 22")).isEqualTo("'+216 22");
        assertThat(CsvExportService.escape("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(CsvExportService.escape("-cmd")).isEqualTo("'-cmd");
        assertThat(CsvExportService.escape("-12,500")).isEqualTo("-12,500");
        assertThat(CsvExportService.escape("Promo Lac")).isEqualTo("Promo Lac");
    }
}
