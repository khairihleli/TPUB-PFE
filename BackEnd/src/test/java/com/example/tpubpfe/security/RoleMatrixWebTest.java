package com.example.tpubpfe.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Role matrix of the back-office (CdC §3.1/§8, contract §5 F3 "role visibility"):
 * OPERATEUR reads the dashboard, network, emergencies, diffusion log and statistics;
 * SUPERVISEUR is read-only on moderation, reservations, journal, AI rules, users and statistics;
 * only ADMINISTRATEUR performs sensitive writes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RoleMatrixWebTest {

    @Autowired private MockMvc mvc;

    private record Case(String role, MockHttpServletRequestBuilder request, boolean allowed) {
    }

    private static UserDetailsImpl principal(String role) {
        return new UserDetailsImpl(990L, role.toLowerCase() + "-matrix@tpub.test", "x", "Matrix", role, true);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder) {
        return builder.contentType(MediaType.APPLICATION_JSON).content("{}");
    }

    @Test
    void operatorAndSupervisorMatrix() throws Exception {
        List<Case> cases = List.of(
                // OPERATEUR: reads
                new Case("OPERATEUR", get("/api/statistics/dashboard"), true),
                new Case("OPERATEUR", get("/api/zones"), true),
                new Case("OPERATEUR", get("/api/supports"), true),
                new Case("OPERATEUR", get("/api/emergency"), true),
                new Case("OPERATEUR", get("/api/diffusion/logs"), true),
                new Case("OPERATEUR", get("/api/reservations"), true),
                // OPERATEUR: denied
                new Case("OPERATEUR", get("/api/campaigns"), false),
                new Case("OPERATEUR", get("/api/ai/rules"), false),
                new Case("OPERATEUR", get("/api/ai/decisions"), false),
                new Case("OPERATEUR", get("/api/reservations/conflicts"), false),
                new Case("OPERATEUR", get("/api/admin/users"), false),
                new Case("OPERATEUR", get("/api/admin/audit"), false),
                new Case("OPERATEUR", json(post("/api/emergency")), false),
                new Case("OPERATEUR", json(post("/api/zones")), false),
                new Case("OPERATEUR", json(put("/api/supports/1")), false),
                new Case("OPERATEUR", json(post("/api/admin/campaigns/1/validate")), false),
                // SUPERVISEUR: reads
                new Case("SUPERVISEUR", get("/api/campaigns"), true),
                new Case("SUPERVISEUR", get("/api/ai/rules"), true),
                new Case("SUPERVISEUR", get("/api/ai/decisions"), true),
                new Case("SUPERVISEUR", get("/api/reservations/conflicts"), true),
                new Case("SUPERVISEUR", get("/api/admin/users"), true),
                new Case("SUPERVISEUR", get("/api/admin/audit"), true),
                new Case("SUPERVISEUR", get("/api/admin/roles"), true),
                new Case("SUPERVISEUR", get("/api/statistics/history"), true),
                // SUPERVISEUR: writes denied
                new Case("SUPERVISEUR", json(post("/api/admin/campaigns/1/validate")), false),
                new Case("SUPERVISEUR", json(post("/api/admin/campaigns/1/reject")), false),
                new Case("SUPERVISEUR", json(post("/api/ai/rules")), false),
                new Case("SUPERVISEUR", json(post("/api/admin/users")), false),
                new Case("SUPERVISEUR", post("/api/admin/users/1/deactivate"), false),
                new Case("SUPERVISEUR", json(post("/api/admin/clients/1/validation")), false),
                new Case("SUPERVISEUR", json(post("/api/emergency")), false),
                new Case("SUPERVISEUR", json(post("/api/reservations/1/cancel")), false),
                // ANNONCEUR never reaches the back-office
                new Case("ANNONCEUR", get("/api/statistics/dashboard"), false),
                new Case("ANNONCEUR", get("/api/admin/users"), false),
                new Case("ANNONCEUR", get("/api/admin/audit"), false)
        );

        List<String> mismatches = new ArrayList<>();
        for (Case c : cases) {
            RequestBuilder request = c.request().with(user(principal(c.role())));
            int status = mvc.perform(request).andReturn().getResponse().getStatus();
            boolean denied = status == 403;
            if (denied == c.allowed()) {
                mismatches.add(c.role() + " " + c.request().buildRequest(new org.springframework.mock.web.MockServletContext())
                        .getRequestURI() + " -> " + status);
            }
        }
        assertThat(mismatches).isEmpty();
    }
}
