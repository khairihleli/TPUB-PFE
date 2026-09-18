package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.security.UserDetailsImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web layer of lane L3 (docs/round2-contract.md §4.5, §4.6): roles, JSON shapes and error codes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CartePrixWebLayerTest {

    @Autowired private MockMvc mvc;

    private static UserDetailsImpl principal(String role) {
        return new UserDetailsImpl(901L, role.toLowerCase() + "-l3@zelqane.test", "x", "Test", role, true);
    }

    @Test
    void heatmapRolesAndShapes() throws Exception {
        mvc.perform(get("/api/heatmap/diffusions").with(user(principal("ANNONCEUR"))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/heatmap/demand").with(user(principal("ANNONCEUR"))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/heatmap/diffusions").with(user(principal("OPERATEUR")))
                        .param("from", "2030-01-01").param("to", "2030-01-31").param("contentType", "PUBLICITE,URGENCE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2030-01-01"))
                .andExpect(jsonPath("$.points.type").value("FeatureCollection"))
                .andExpect(jsonPath("$.points.features").isArray());
        mvc.perform(get("/api/heatmap/demand").with(user(principal("SUPERVISEUR")))
                        .param("from", "2030-01-10").param("to", "2030-01-01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RANGE"));
        mvc.perform(get("/api/heatmap/demand/public").with(user(principal("ANNONCEUR")))
                        .param("startDate", "2030-01-01").param("endDate", "2030-01-07")
                        .param("startTime", "18:00").param("endTime", "23:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.byZone").isArray());
        mvc.perform(get("/api/heatmap/demand/public").with(user(principal("ANNONCEUR")))
                        .param("startTime", "23:00").param("endTime", "18:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TIME_RANGE"));
        int anonymous = mvc.perform(get("/api/heatmap/demand/public")).andReturn().getResponse().getStatus();
        org.assertj.core.api.Assertions.assertThat(anonymous).isIn(401, 403);
    }

    @Test
    void pricingConfigAndEstimateBreakdown() throws Exception {
        mvc.perform(get("/api/pricing/config").with(user(principal("ANNONCEUR"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.hourBands[3].label").value("Pointe du soir"))
                .andExpect(jsonPath("$.dayMultipliers.SAMEDI").value(1.15));
        mvc.perform(post("/api/estimates").with(user(principal("ANNONCEUR"))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"supportIds\":[987654],\"startDate\":\"2030-01-01\",\"endDate\":\"2030-01-02\","
                                + "\"startTime\":\"18:00\",\"endTime\":\"22:00\",\"campaignId\":null}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SUPPORT_NOT_FOUND"));
    }

    @Test
    void emergencyPolygonAndCircleTogetherAreRejected() throws Exception {
        mvc.perform(post("/api/emergency").with(user(principal("ADMINISTRATEUR"))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Alerte\",\"content\":\"Contenu\",\"startDate\":\"2030-01-01\","
                                + "\"endDate\":\"2030-01-01\",\"latitude\":36.8,\"longitude\":10.18,\"radiusKm\":1,"
                                + "\"polygon\":{\"type\":\"Polygon\",\"coordinates\":[[[10.17,36.79],[10.19,36.79],"
                                + "[10.19,36.81],[10.17,36.81]]]}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMERGENCY_TARGET_CONFLICT"));
    }
}
