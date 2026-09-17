package com.example.tpubpfe.security;

import com.example.tpubpfe.model.LoginFailureReason;
import com.example.tpubpfe.model.LoginHistory;
import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.LoginHistoryRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-level checks of lane C: JSON 401/403 bodies, session-bound tokens (logout, revocation, password change,
 * deactivation), login history, error handler codes, admin users and audit trail.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountsSecurityWebTest {

    private static final Pattern TOKEN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern SESSION = Pattern.compile("\"sessionId\"\\s*:\\s*\"([^\"]+)\"");

    @Autowired private MockMvc mvc;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private LoginHistoryRepository loginHistoryRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtService jwtService;

    @BeforeEach
    void roles() {
        for (RoleCode code : RoleCode.values()) {
            roleRepository.findByCode(code).orElseGet(() -> roleRepository.save(
                    Role.builder().code(code).name(code.name()).build()));
        }
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@tpub.test";
    }

    private MvcResult register(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"nom\":\"Annonceur Test\","
                                + "\"societe\":\"Test SARL\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andReturn();
    }

    private String login(String email, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return extract(TOKEN, result);
    }

    private static String extract(Pattern pattern, MvcResult result) throws Exception {
        Matcher matcher = pattern.matcher(result.getResponse().getContentAsString());
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private User staff(RoleCode code) {
        return userRepository.save(User.builder().email(unique(code.name().toLowerCase())).nom("Staff " + code)
                .passwordHash(passwordEncoder.encode("Staff1234")).role(roleRepository.findByCode(code).orElseThrow())
                .isActive(true).build());
    }

    @Test
    void protectedRoutesAnswerJson401And403() throws Exception {
        mvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.path").value("/api/me"))
                .andExpect(jsonPath("$.message").value("Authentification requise."));

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer abc.def.ghi"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));

        String expired = jwtService.generateToken("nobody@tpub.test", "ANNONCEUR", "sid",
                Instant.now().minusSeconds(7200), Instant.now().minusSeconds(3600));
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(expired)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));

        String token = extract(TOKEN, register(unique("roles"), "Secret123"));
        mvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void invalidTokenIsIgnoredOnPublicAndCredentialRoutes() throws Exception {
        mvc.perform(get("/api/diffusion/next").header(HttpHeaders.AUTHORIZATION, "Bearer garbage"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MISSING_PARAMETER"));

        String email = unique("public");
        register(email, "Secret123");
        mvc.perform(post("/api/auth/login").header(HttpHeaders.AUTHORIZATION, "Bearer garbage")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Secret123\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void logoutRevokesTheTokenAndOtherSessionsSurvive() throws Exception {
        String email = unique("logout");
        String first = extract(TOKEN, register(email, "Secret123"));
        String second = login(email, "Secret123");

        mvc.perform(get("/api/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.current == true)]").isNotEmpty());

        mvc.perform(post("/api/me/logout").header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.client.validationStatus").value("PENDING"))
                .andExpect(jsonPath("$.isActive").value(true));

        mvc.perform(delete("/api/me/sessions/does-not-exist").header(HttpHeaders.AUTHORIZATION, bearer(second)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));
    }

    @Test
    void passwordChangeKeepsCurrentSessionAndRevokesOthers() throws Exception {
        String email = unique("pwd");
        String other = extract(TOKEN, register(email, "Secret123"));
        String current = login(email, "Secret123");

        mvc.perform(post("/api/me/password").header(HttpHeaders.AUTHORIZATION, bearer(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"Secret123\",\"newPassword\":\"sansChiffre\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.newPassword").value("Le mot de passe doit contenir au moins une lettre et un chiffre."));

        mvc.perform(post("/api/me/password").header(HttpHeaders.AUTHORIZATION, bearer(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"Secret123\",\"newPassword\":\"Nouveau456\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(current))).andExpect(status().isOk());
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(other)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));
        login(email, "Nouveau456");
    }

    @Test
    void loginFailuresAreJournaledWithStableCodes() throws Exception {
        String email = unique("history");
        register(email, "Secret123");

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Mauvais999\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("E-mail ou mot de passe incorrect."));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + unique("ghost") + "\",\"password\":\"Mauvais999\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"Secret123\",\"nom\":\"Dup\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));

        User user = userRepository.findByEmail(email).orElseThrow();
        List<LoginHistory> history = loginHistoryRepository.findAll().stream()
                .filter(h -> user.getId().equals(h.getUserId())).toList();
        assertThat(history).extracting(LoginHistory::getFailureReason)
                .containsExactlyInAnyOrder(null, LoginFailureReason.BAD_CREDENTIALS);

        String token = login(email, "Secret123");
        mvc.perform(get("/api/me/login-history").param("limit", "2").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].success").value(true));
    }

    @Test
    void deactivatedAccountIsRejectedEverywhere() throws Exception {
        String email = unique("disabled");
        String token = extract(TOKEN, register(email, "Secret123"));
        User target = userRepository.findByEmail(email).orElseThrow();
        User admin = staff(RoleCode.ADMINISTRATEUR);
        UserDetailsImpl adminPrincipal = UserDetailsImpl.fromUser(admin);

        mvc.perform(post("/api/admin/users/" + target.getId() + "/deactivate").with(user(adminPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isActive").value(false))
                .andExpect(jsonPath("$.activeSessions").value(0));
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Secret123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));

        mvc.perform(post("/api/admin/users/" + admin.getId() + "/deactivate").with(user(adminPrincipal)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CANNOT_DEACTIVATE_SELF"));

        mvc.perform(get("/api/admin/audit").param("entityType", "USER").param("entityId", target.getId().toString())
                        .with(user(adminPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].action").value("USER_DEACTIVATED"))
                .andExpect(jsonPath("$.items[0].actorEmail").value(admin.getEmail()))
                .andExpect(jsonPath("$.items[0].actorName").value(admin.getNom()))
                .andExpect(jsonPath("$.items[0].details.revokedSessions").value(1));
    }

    @Test
    void disabledUserWithLiveSessionGetsAccountDisabled() throws Exception {
        String email = unique("flag");
        String token = extract(TOKEN, register(email, "Secret123"));
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setIsActive(false);
        userRepository.save(user);

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void adminManagesStaffAndClients() throws Exception {
        UserDetailsImpl admin = UserDetailsImpl.fromUser(staff(RoleCode.ADMINISTRATEUR));
        UserDetailsImpl supervisor = UserDetailsImpl.fromUser(staff(RoleCode.SUPERVISEUR));
        String staffEmail = unique("operateur");

        mvc.perform(post("/api/admin/users").with(user(admin)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + staffEmail + "\",\"password\":\"Secret123\",\"nom\":\"Op\",\"role\":\"ANNONCEUR\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ROLE_NOT_ALLOWED"));
        mvc.perform(post("/api/admin/users").with(user(admin)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + staffEmail + "\",\"password\":\"Secret123\",\"nom\":\"Op\",\"role\":\"OPERATEUR\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("OPERATEUR"))
                .andExpect(jsonPath("$.client").doesNotExist());
        mvc.perform(post("/api/admin/users").with(user(supervisor)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + unique("x") + "\",\"password\":\"Secret123\",\"nom\":\"X\",\"role\":\"OPERATEUR\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        String advertiser = unique("client");
        register(advertiser, "Secret123");
        User advertiserUser = userRepository.findByEmail(advertiser).orElseThrow();
        MvcResult page = mvc.perform(get("/api/admin/users").param("q", advertiser).param("role", "ANNONCEUR")
                        .param("validationStatus", "PENDING").with(user(supervisor)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].activeSessions").value(1))
                .andExpect(jsonPath("$.items[0].campaignsCount").value(0))
                .andReturn();
        Matcher clientId = Pattern.compile("\"clientId\"\\s*:\\s*(\\d+)").matcher(page.getResponse().getContentAsString());
        assertThat(clientId.find()).isTrue();

        mvc.perform(post("/api/admin/clients/" + clientId.group(1) + "/validation").with(user(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"validationStatus\":\"VALIDATED\",\"trustLevel\":80,\"notes\":\"KYC ok\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(advertiserUser.getId()))
                .andExpect(jsonPath("$.client.validationStatus").value("VALIDATED"))
                .andExpect(jsonPath("$.client.trustLevel").value(80))
                .andExpect(jsonPath("$.clientNotes").value("KYC ok"));
        mvc.perform(post("/api/admin/clients/987654/validation").with(user(admin)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"validationStatus\":\"VALIDATED\",\"trustLevel\":101}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.trustLevel").value("Doit être inférieur ou égal à 100."));

        mvc.perform(post("/api/admin/users/" + advertiserUser.getId() + "/sessions/revoke").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revoked").value(1));
        mvc.perform(get("/api/admin/audit").param("action", "CLIENT_VALIDATION_CHANGED,USER_SESSIONS_REVOKED")
                        .with(user(supervisor)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.action == 'USER_SESSIONS_REVOKED')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.action == 'CLIENT_VALIDATION_CHANGED')]").isNotEmpty());
        mvc.perform(get("/api/admin/roles").with(user(supervisor)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'OPERATEUR')]").isNotEmpty());
    }

    @Test
    void errorHandlerUsesStableCodes() throws Exception {
        UserDetailsImpl admin = new UserDetailsImpl(900L, "admin-err@tpub.test", "x", "Admin", "ADMINISTRATEUR", true);

        mvc.perform(get("/api/admin/users/not-a-number").with(user(admin)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
        mvc.perform(get("/api/admin/users/987654").with(user(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
        mvc.perform(get("/api/does-not-exist").with(user(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(delete("/api/admin/roles").with(user(admin)))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
        mvc.perform(put("/api/me").with(user(admin)).contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_BODY"));
        mvc.perform(put("/api/me").with(user(admin)).contentType(MediaType.TEXT_PLAIN).content("x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pas-un-email\",\"password\":\"court\",\"nom\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.email").value("Adresse e-mail invalide."))
                .andExpect(jsonPath("$.errors.password").value("Doit contenir entre 8 et 100 caractères."))
                .andExpect(jsonPath("$.errors.nom").value("Champ obligatoire."));
        mvc.perform(post("/api/me/logo").with(user(admin)).contentType(MediaType.MULTIPART_FORM_DATA)
                        .content("--x--"))
                .andExpect(status().isBadRequest());
    }
}
