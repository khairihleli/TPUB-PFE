package com.example.tpubpfe.security;

import com.example.tpubpfe.config.TpubProperties;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.SupportType;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.AuditLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.security.device.DeviceRequest;
import com.example.tpubpfe.security.totp.Base32;
import com.example.tpubpfe.security.totp.TotpGenerator;
import com.example.tpubpfe.service.storage.FileStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** HTTP-level checks of round 2 lane L2: TOTP login, forced password change, device keys, signed media. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class Round2SecurityWebTest {

    @Autowired private MockMvc mvc;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ZoneRepository zoneRepository;
    @Autowired private DiffusionSupportRepository supportRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private FileStorageService storage;
    @Autowired private TpubProperties properties;

    @BeforeEach
    void roles() {
        for (RoleCode code : RoleCode.values()) {
            roleRepository.findByCode(code).orElseGet(() -> roleRepository.save(
                    Role.builder().code(code).name(code.name()).build()));
        }
    }

    static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@tpub.test";
    }

    static String field(MvcResult result, String name) throws Exception {
        Matcher matcher = Pattern.compile("\"" + name + "\"\\s*:\\s*\"([^\"]+)\"").matcher(result.getResponse().getContentAsString());
        assertThat(matcher.find()).as(name).isTrue();
        return matcher.group(1);
    }

    static String json(String... pairs) {
        StringBuilder out = new StringBuilder("{");
        for (int i = 0; i < pairs.length; i += 2) {
            out.append(i == 0 ? "" : ",").append('"').append(pairs[i]).append("\":\"").append(pairs[i + 1]).append('"');
        }
        return out.append('}').toString();
    }

    private User staff(RoleCode code, String password, boolean mustChange) {
        return userRepository.save(User.builder().email(unique(code.name().toLowerCase())).nom("Staff " + code)
                .passwordHash(passwordEncoder.encode(password)).role(roleRepository.findByCode(code).orElseThrow())
                .isActive(true).mustChangePassword(mustChange).build());
    }

    private MvcResult login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", email, "password", password)))
                .andExpect(status().isOk())
                .andReturn();
    }

    private static String code(String secret, long step) {
        return TotpGenerator.code(Base32.decode(secret), step);
    }

    @Test
    void totpEnrolmentLoginChallengeReplayRecoveryAndDisable() throws Exception {
        String email = unique("totp");
        MvcResult registered = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", email, "password", "Secret123", "nom", "Annonceur 2FA")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.twoFactorEnabled").value(false))
                .andReturn();
        String bearer = "Bearer " + field(registered, "token");

        MvcResult setup = mvc.perform(post("/api/me/2fa/setup").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.otpauthUri").value(org.hamcrest.Matchers.startsWith("otpauth://totp/TPUB:")))
                .andReturn();
        String secret = field(setup, "secret");
        assertThat(Base32.decode(secret)).hasSize(20);
        long step = TotpGenerator.step(Instant.now());

        mvc.perform(post("/api/me/2fa/enable").header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("code", code(secret, step - 5))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TOTP_CODE_INVALID"));
        MvcResult enabled = mvc.perform(post("/api/me/2fa/enable").header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("code", code(secret, step))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recoveryCodes.length()").value(10))
                .andReturn();
        String recovery = Pattern.compile("\"([0-9a-z]{5}-[0-9a-z]{5})\"").matcher(enabled.getResponse().getContentAsString())
                .results().findFirst().orElseThrow().group(1);
        mvc.perform(get("/api/me/2fa").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.recoveryCodesRemaining").value(10))
                .andExpect(jsonPath("$.required").value(false));
        mvc.perform(post("/api/me/2fa/setup").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TOTP_ALREADY_ENABLED"));

        // Login now stops at the challenge: no token.
        MvcResult challenge = login(email, "Secret123");
        assertThat(challenge.getResponse().getContentAsString()).doesNotContain("\"token\"");
        assertThat(field(challenge, "status")).isEqualTo("TOTP_REQUIRED");
        String token = field(challenge, "challengeToken");
        assertThat(token).startsWith("tpc_");

        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", token, "code", code(secret, step - 5))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOTP_CODE_INVALID"))
                .andExpect(jsonPath("$.message").value("Code de vérification incorrect."));
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", token, "code", code(secret, step + 1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.twoFactorEnabled").value(true))
                .andExpect(jsonPath("$.token").isNotEmpty());
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", token, "code", code(secret, step + 1))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

        // Replay of an accepted step is refused; a recovery code works once.
        String second = field(login(email, "Secret123"), "challengeToken");
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", second, "code", code(secret, step + 1))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOTP_CODE_INVALID"));
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", second, "code", recovery.toUpperCase())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recoveryCodeUsed").value(true));
        String third = field(login(email, "Secret123"), "challengeToken");
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", third, "code", recovery)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOTP_CODE_INVALID"));

        // Attempts are capped per challenge.
        for (int i = 1; i < properties.getSecurity().getTotp().getMaxAttempts(); i++) {
            mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                            .content(json("challengeToken", third, "code", "zzzzz-zzzzz")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("TOTP_CODE_INVALID"));
        }
        mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                        .content(json("challengeToken", third, "code", code(secret, step + 1))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

        mvc.perform(get("/api/me/login-history").param("limit", "3").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].failureReason").value("TOTP_INVALID"));

        // Disable: password, then a code.
        mvc.perform(post("/api/me/2fa/disable").header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("password", "Mauvais123", "code", "123456")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
        String another = Pattern.compile("\"([0-9a-z]{5}-[0-9a-z]{5})\"").matcher(enabled.getResponse().getContentAsString())
                .results().skip(1).findFirst().orElseThrow().group(1);
        mvc.perform(post("/api/me/2fa/disable").header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("password", "Secret123", "code", another)))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", email, "password", "Secret123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"));
        assertThat(auditLogRepository.findAll()).extracting("action").contains("USER_2FA_ENABLED", "USER_2FA_DISABLED");
    }

    @Test
    void forcedPasswordChangeBlocksEverythingButTheAllowedRoutes() throws Exception {
        User operator = staff(RoleCode.OPERATEUR, "Initial123", true);
        MvcResult result = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", operator.getEmail(), "password", "Initial123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true))
                .andReturn();
        String bearer = "Bearer " + field(result, "token");

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true));
        mvc.perform(get("/api/me/2fa").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isOk());
        mvc.perform(get("/api/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mvc.perform(get("/api/supports").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));

        mvc.perform(post("/api/me/password").header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("currentPassword", "Initial123", "newPassword", "Nouveau456")))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isOk());
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(jsonPath("$.mustChangePassword").value(false));
    }

    @Test
    void adminRequiresPasswordChangeAndResetsTwoFactorButNeverOnSelf() throws Exception {
        User admin = staff(RoleCode.ADMINISTRATEUR, "Admin1234", false);
        User target = staff(RoleCode.SUPERVISEUR, "Superviseur1", false);
        UserDetailsImpl adminPrincipal = UserDetailsImpl.fromUser(admin);
        String targetBearer = "Bearer " + field(login(target.getEmail(), "Superviseur1"), "token");

        mvc.perform(post("/api/admin/users/" + target.getId() + "/require-password-change").with(user(adminPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true))
                .andExpect(jsonPath("$.activeSessions").value(0));
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, targetBearer))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));
        mvc.perform(post("/api/admin/users/" + admin.getId() + "/require-password-change").with(user(adminPrincipal)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ROLE_NOT_ALLOWED"));
        mvc.perform(post("/api/admin/users/" + target.getId() + "/2fa/reset").with(user(adminPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.twoFactorEnabled").value(false));
        mvc.perform(post("/api/admin/users/" + admin.getId() + "/2fa/reset").with(user(adminPrincipal)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/users/" + target.getId() + "/2fa/reset")
                        .with(user(UserDetailsImpl.fromUser(staff(RoleCode.SUPERVISEUR, "Superviseur2", false)))))
                .andExpect(status().isForbidden());
    }

    @Test
    void deviceKeysGuardThePlayerRoutes() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Zone zone = zoneRepository.save(Zone.builder().name("Zone L2 " + suffix).latitude(new BigDecimal("36.8"))
                .longitude(new BigDecimal("10.18")).radiusKm(new BigDecimal("3")).isActive(true).build());
        DiffusionSupport screen = supportRepository.save(DiffusionSupport.builder().zone(zone).name("Écran L2 " + suffix)
                .supportType(SupportType.ECRAN).latitude(new BigDecimal("36.8001")).longitude(new BigDecimal("10.1801"))
                .build());
        UserDetailsImpl admin = UserDetailsImpl.fromUser(staff(RoleCode.ADMINISTRATEUR, "Admin1234", false));
        String id = String.valueOf(screen.getId());

        mvc.perform(get("/api/diffusion/next").param("supportId", id))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("DEVICE_KEY_REQUIRED"))
                .andExpect(jsonPath("$.message").value("Écran non appairé : clé d'appareil manquante."));
        mvc.perform(post("/api/supports/" + id + "/device-key")
                        .with(user(UserDetailsImpl.fromUser(staff(RoleCode.SUPERVISEUR, "Superviseur1", false)))))
                .andExpect(status().isForbidden());

        MvcResult issued = mvc.perform(post("/api/supports/" + id + "/device-key").with(user(admin)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pairingPath").value(org.hamcrest.Matchers.startsWith("/ecran/" + id + "?cle=tpd_")))
                .andReturn();
        String key = field(issued, "deviceKey");
        assertThat(key).matches("^tpd_[A-Za-z0-9_-]{43}$");

        mvc.perform(get("/api/diffusion/next").param("supportId", id).header(DeviceRequest.HEADER, key.replace('A', 'B') + "x"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("DEVICE_KEY_INVALID"));
        mvc.perform(get("/api/diffusion/next").param("supportId", id).param("datetime", "2030-01-10T10:00:00")
                        .header(DeviceRequest.HEADER, key))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("defaut"))
                .andExpect(jsonPath("$.datetime").value("2030-01-10T10:00:00"))
                .andExpect(jsonPath("$.simulatedTime").value(true));
        mvc.perform(post("/api/diffusion/interactions").param("supportId", id).header(DeviceRequest.HEADER, key)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"diffusionLogId\":987654,\"type\":\"CLIC\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DIFFUSION_LOG_NOT_FOUND"));

        mvc.perform(get("/api/supports/device-keys")
                        .with(user(UserDetailsImpl.fromUser(staff(RoleCode.OPERATEUR, "Operateur1", false)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.supportId == " + id + ")].paired").value(org.hamcrest.Matchers.contains(true)));
        mvc.perform(get("/api/supports/" + id + "/device-key").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keyPrefix").value(key.substring(0, 12)))
                .andExpect(jsonPath("$.lastUsedAt").isNotEmpty());

        // Rotation invalidates the old key, revocation the new one.
        String rotated = field(mvc.perform(post("/api/supports/" + id + "/device-key").with(user(admin)))
                .andExpect(status().isCreated()).andReturn(), "deviceKey");
        mvc.perform(get("/api/diffusion/next").param("supportId", id).header(DeviceRequest.HEADER, key))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("DEVICE_KEY_INVALID"));
        mvc.perform(get("/api/diffusion/next").param("supportId", id).header(DeviceRequest.HEADER, rotated))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/supports/" + id + "/device-key").with(user(admin))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/supports/" + id + "/device-key").with(user(admin))).andExpect(status().isNoContent());
        mvc.perform(get("/api/diffusion/next").param("supportId", id).header(DeviceRequest.HEADER, rotated))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/supports/987654/device-key").with(user(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SUPPORT_NOT_FOUND"));

        assertThat(auditLogRepository.findAll()).extracting("action")
                .contains("SUPPORT_DEVICE_KEY_ISSUED", "SUPPORT_DEVICE_KEY_ROTATED", "SUPPORT_DEVICE_KEY_REVOKED");
        assertThat(auditLogRepository.findAll().toString()).doesNotContain(rotated);
    }

    @Test
    void signedMediaFilterChecksSignatureExpiryAndTraversal() throws Exception {
        Path root = Paths.get(properties.getMedia().getUploadDir()).toAbsolutePath().normalize();
        Path file = root.resolve("campaigns/l2-test/visuel.txt");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "visuel");

        String signed = storage.publicUrl("campaigns/l2-test/visuel.txt");
        mvc.perform(get(signed))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.startsWith("private, max-age=")));
        mvc.perform(get("/uploads/campaigns/l2-test/visuel.txt"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEDIA_SIGNATURE_REQUIRED"));
        mvc.perform(get(signed.replace("visuel.txt", "autre.txt")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEDIA_SIGNATURE_INVALID"));
        mvc.perform(get(signed.substring(0, signed.length() - 2) + "xx"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEDIA_SIGNATURE_INVALID"));

        long past = (Instant.now().getEpochSecond() / 300 - 2) * 300;
        String expiredSig = storage.signer().signature("campaigns/l2-test/visuel.txt", past);
        mvc.perform(get("/uploads/campaigns/l2-test/visuel.txt").param("exp", String.valueOf(past)).param("sig", expiredSig))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEDIA_URL_EXPIRED"))
                .andExpect(jsonPath("$.message").value("Lien de média expiré : rechargez la page."));

        MvcResult traversal = mvc.perform(get(java.net.URI.create("/uploads/campaigns/%2E%2E/%2E%2E/application.yml?exp=1&sig=x")))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(traversal.getResponse().getContentAsString()).isEmpty();
        // Double-encoded dots are a traversal attempt too.
        mvc.perform(get(java.net.URI.create("/uploads/campaigns/%252E%252E/l2-test/visuel.txt?exp=1&sig=x")))
                .andExpect(status().isNotFound());
    }
}
