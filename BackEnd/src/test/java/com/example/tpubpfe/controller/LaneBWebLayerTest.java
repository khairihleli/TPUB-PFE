package com.example.tpubpfe.controller;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.security.UserDetailsImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-level checks of lane B: public endpoints, role restrictions, JSON formats, CSV download, /uploads serving.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LaneBWebLayerTest {

    @Autowired private MockMvc mvc;
    @Autowired private TpubProperties properties;
    @Autowired private ZoneRepository zoneRepository;

    private static UserDetailsImpl principal(String role) {
        return new UserDetailsImpl(900L, role.toLowerCase() + "@tpub.test", "x", "Test", role, true);
    }

    @Test
    void diffusionEndpointsArePublicAndReturnStableCodes() throws Exception {
        mvc.perform(get("/api/diffusion/next"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MISSING_PARAMETER"));
        mvc.perform(get("/api/diffusion/next").param("supportId", "987654"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SUPPORT_NOT_FOUND"));
        mvc.perform(post("/api/diffusion/interactions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"diffusionLogId\":987654,\"type\":\"CLIC\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DIFFUSION_LOG_NOT_FOUND"));
        int logs = mvc.perform(get("/api/diffusion/logs")).andReturn().getResponse().getStatus();
        assertThat(logs).isIn(401, 403);
    }

    @Test
    void rolesAreEnforced() throws Exception {
        mvc.perform(get("/api/statistics/dashboard").with(user(principal("ANNONCEUR"))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/statistics/dashboard").with(user(principal("OPERATEUR"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.supportsByStatus.ACTIF").exists());
        mvc.perform(get("/api/reservations/conflicts").with(user(principal("OPERATEUR"))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/statistics/export.csv").param("type", "mine").with(user(principal("ADMINISTRATEUR"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(multipart("/api/campaigns/987654/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", new byte[]{(byte) 0x89, 'P', 'N', 'G'}))
                        .param("kind", "BANNER")
                        .with(user(principal("ANNONCEUR"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CAMPAIGN_NOT_FOUND"));
        mvc.perform(multipart("/api/campaigns/987654/media")
                        .file(new MockMultipartFile("file", "a.png", "image/png", new byte[]{1}))
                        .with(user(principal("SUPERVISEUR"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void availabilityJsonUsesSecondsAndCsvIsAnAttachment() throws Exception {
        Zone zone = zoneRepository.save(Zone.builder().name("Zone web " + UUID.randomUUID()).latitude(new BigDecimal("33.8"))
                .longitude(new BigDecimal("10.1")).radiusKm(new BigDecimal("2")).isActive(true).build());
        mvc.perform(get("/api/availability").with(user(principal("SUPERVISEUR")))
                        .param("zoneId", String.valueOf(zone.getId()))
                        .param("startDate", "2030-01-10").param("endDate", "2030-01-12")
                        .param("startTime", "18:00").param("endTime", "23:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startTime").value("18:00:00"))
                .andExpect(jsonPath("$.days").value(3))
                .andExpect(jsonPath("$.hoursPerDay").value(5.0))
                .andExpect(jsonPath("$.summary.totalSupports").value(0));
        mvc.perform(get("/api/availability").with(user(principal("SUPERVISEUR")))
                        .param("startDate", "2030-01-10").param("endDate", "2030-01-12")
                        .param("startTime", "18:00").param("endTime", "23:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MISSING_PARAMETER"));

        MvcResult csv = mvc.perform(get("/api/statistics/export.csv").param("type", "dashboard")
                        .with(user(principal("ADMINISTRATEUR"))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/csv;charset=UTF-8"))
                .andReturn();
        assertThat(csv.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION))
                .startsWith("attachment; filename=\"tpub-statistiques-dashboard-");
        assertThat(new String(csv.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8))
                .startsWith("﻿Indicateur;Valeur");
    }

    @Test
    void uploadsAreServedPubliclyWithRangeSupport() throws Exception {
        Path root = Paths.get(properties.getMedia().getUploadDir()).toAbsolutePath().normalize();
        Path file = root.resolve("campaigns/web-test/hello.txt");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "bonjour TPUB");

        MvcResult full = mvc.perform(get("/uploads/campaigns/web-test/hello.txt"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(full.getResponse().getContentAsString()).isEqualTo("bonjour TPUB");
        assertThat(full.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("max-age=86400");

        mvc.perform(get("/uploads/campaigns/web-test/hello.txt").header(HttpHeaders.RANGE, "bytes=0-6"))
                .andExpect(status().isPartialContent());
        mvc.perform(get("/uploads/campaigns/web-test/missing.txt"))
                .andExpect(status().isNotFound());
    }
}
