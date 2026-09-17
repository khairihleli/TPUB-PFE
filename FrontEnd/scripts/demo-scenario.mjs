#!/usr/bin/env node
/**
 * Runs the demonstration scenario of the cahier des charges (§11, 18 steps) end to end over HTTP
 * against a running TPUB backend, asserting every step and printing one ✔ / ✘ line per step.
 *
 * Prerequisites: backend started (start-local.ps1) and the network seeded (node scripts/seed-demo.mjs).
 * Each run registers a fresh advertiser and books a fresh future window, so it can be replayed.
 * The urgent message created at step 17 is deactivated at the end so the real Porteurs are untouched.
 *
 * Round 2 (docs/round2-contract.md §10): the administrator password comes from TPUB_ADMIN_PASSWORD /
 * .tpub-local.secrets, the player calls carry the device key of scripts/.demo-device-keys.json (the
 * Porteur is paired as admin when the key is missing or revoked), ?datetime= needs the backend `local`
 * profile, and the double approvals are completed with admin2@tpub.local (created by seed-demo.mjs).
 *
 * Usage: node scripts/demo-scenario.mjs   (TPUB_API_URL defaults to http://localhost:8080)
 *        --verbose  prints the payload summary of each step
 */
import {
  adminCredentials,
  demoPassword,
  DEVICE_KEY_HEADER,
  deviceKeyFor,
  DEVICE_KEYS_FILE,
  generatePassword,
  login,
  saveDeviceKey,
  SetupError,
} from "./lib/demo-auth.mjs";
import { API, SLOT_PRESETS, call, day, items, pngForm } from "./lib/tpub-api.mjs";

const SECOND_ADMIN_EMAIL = "admin2@tpub.local";
const VERBOSE = process.argv.includes("--verbose");

/** Map target: Tunis Centre (seeded zone), 3 km around Avenue Habib Bourguiba. */
const TARGET = { latitude: 36.8008, longitude: 10.18, radiusKm: 3, label: "Centre-ville de Tunis" };

class AssertionError extends Error {}
function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

/** Media URL without its signature (`?exp=&sig=`): two signed URLs of one file compare equal. */
function mediaPath(url) {
  return typeof url === "string" ? url.split("?")[0] : url;
}

let simulatedTimeWarned = false;

/**
 * Player call with the device key of the Porteur. A refused key (revoked or rotated) is replaced
 * once by a new pairing done as administrator.
 */
async function playerCall(method, path, { query, body, supportId }) {
  const send = async (key) =>
    call(method, path, {
      query: { supportId, ...query },
      body,
      headers: { [DEVICE_KEY_HEADER]: key },
    });
  let result;
  try {
    result = await send(await deviceKeyFor(supportId, ctx.admin.token));
  } catch (err) {
    if (err.code !== "DEVICE_KEY_INVALID") throw err;
    const issued = await call("POST", `/api/supports/${supportId}/device-key`, {
      token: ctx.admin.token,
    });
    saveDeviceKey(supportId, issued.deviceKey);
    result = await send(issued.deviceKey);
  }
  if (query?.datetime && result?.simulatedTime === false && !simulatedTimeWarned) {
    simulatedTimeWarned = true;
    console.log("  ⚠ le backend n'est pas en profil local : horloge serveur utilisée");
  }
  return result;
}

/** Logs in as the second administrator (double approvals). */
async function secondAdmin() {
  if (ctx.admin2) return ctx.admin2;
  const password = demoPassword(SECOND_ADMIN_EMAIL, { create: false });
  assert(
    password,
    `mot de passe de ${SECOND_ADMIN_EMAIL} introuvable : lancez scripts/seed-demo.mjs`,
  );
  ctx.admin2 = await login({ email: SECOND_ADMIN_EMAIL, password });
  return ctx.admin2;
}

function approverNames(approvals) {
  return (approvals ?? []).map((a) => a.approverName).join(" et ");
}

const STEPS = [];
function step(title, run) {
  STEPS.push({ title, run });
}

/** Shared state filled step by step. */
const ctx = {
  runId: Date.now(),
  // Future window, different on each run (days 20..79) so replays rarely share a slot.
  offset: 20 + (Math.floor(Date.now() / 1000) % 60),
};
ctx.startDate = day(ctx.offset);
ctx.endDate = day(ctx.offset + 6);
ctx.slot = SLOT_PRESETS.SOIR;
ctx.diffusionDate = day(ctx.offset + 2);
ctx.datetime = `${ctx.diffusionDate}T19:${String(ctx.runId % 60).padStart(2, "0")}:00`;

// 1 ─────────────────────────────────────────────────────────────────────────────
step("Un client annonceur crée un compte", async () => {
  ctx.advertiser = {
    email: `demo.scenario.${ctx.runId}@annonceur.tn`,
    password: generatePassword(),
    nom: "Sami Trabelsi",
    societe: "Librairie El Manar",
    telephone: "+216 22 111 333",
    adresse: "El Manar, Tunis",
  };
  const auth = await call("POST", "/api/auth/register", { body: ctx.advertiser });
  assert(auth.token && auth.role === "ANNONCEUR", "jeton ANNONCEUR attendu");
  assert(auth.sessionId && auth.expiresAt, "session ouverte attendue (sessionId, expiresAt)");
  ctx.token = auth.token;
  const me = await call("GET", "/api/me", { token: ctx.token });
  assert(me.client?.clientId, "profil client attendu");
  ctx.clientId = me.client.clientId;
  ctx.admin = await login(adminCredentials());
  return `${auth.email} (client #${ctx.clientId}, validation ${me.client.validationStatus})`;
});

// 2 ─────────────────────────────────────────────────────────────────────────────
step("Il crée une campagne publicitaire", async () => {
  const campaign = await call("POST", "/api/campaigns", {
    token: ctx.token,
    body: {
      name: "Rentrée scolaire — Librairie El Manar",
      objective:
        "Faire connaître aux familles du centre-ville les fournitures et manuels de la rentrée disponibles à la librairie.",
      budget: 1500,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      startTime: "09:00",
      endTime: "21:00",
    },
  });
  assert(campaign.status === "BROUILLON", `statut BROUILLON attendu, reçu ${campaign.status}`);
  assert(campaign.editable === true, "campagne modifiable attendue");
  ctx.campaignId = campaign.id;
  return `campagne #${campaign.id} « ${campaign.name} » (${campaign.startDate} → ${campaign.endDate})`;
});

// 3 ─────────────────────────────────────────────────────────────────────────────
step("Il ajoute une image", async () => {
  const media = await call("POST", `/api/campaigns/${ctx.campaignId}/media`, {
    token: ctx.token,
    form: pngForm("rentree-scolaire-librairie.png", ctx.runId),
  });
  assert(media.fileType === "IMAGE", `type IMAGE attendu, reçu ${media.fileType}`);
  assert(media.widthPx === 1280 && media.heightPx === 720, "dimensions 1280×720 attendues");
  assert(media.url?.startsWith("/uploads/"), "URL /uploads attendue");
  assert(
    /[?&]exp=\d+/.test(media.url) && /[?&]sig=/.test(media.url),
    "URL signée (exp, sig) attendue",
  );
  const file = await fetch(`${API}${media.url}`);
  assert(
    file.ok && file.headers.get("content-type") === "image/png",
    "/uploads doit servir le PNG avec l'URL signée",
  );
  const unsigned = await fetch(`${API}${mediaPath(media.url)}`);
  assert(unsigned.status === 403, `sans signature, 403 attendu (reçu ${unsigned.status})`);
  ctx.mediaUrl = media.url;
  return `média #${media.id} ${media.widthPx}×${media.heightPx}, ${media.fileSizeBytes} octets → ${media.url}`;
});

// 4 ─────────────────────────────────────────────────────────────────────────────
step("L'IA analyse automatiquement le contenu", async () => {
  const report = await call("POST", `/api/ai/check-content/${ctx.campaignId}`, {
    token: ctx.token,
  });
  assert(report.preview === true, "pré-analyse attendue sur un brouillon");
  assert(
    ["approved", "review_required", "rejected"].includes(report.aiStatus),
    "statut IA attendu",
  );
  assert(
    typeof report.riskScore === "number" && typeof report.qualityScore === "number",
    "scores attendus",
  );
  assert(report.mediaAnalyses?.length === 1, "analyse du média attendue");
  const campaign = await call("GET", `/api/campaigns/${ctx.campaignId}`, { token: ctx.token });
  assert(campaign.status === "BROUILLON", "la pré-analyse ne change pas le statut");
  return `pré-analyse ${report.aiStatus} · risque ${report.riskScore} · qualité ${report.qualityScore} · OCR ${report.ocrEngine}`;
});

// 5 ─────────────────────────────────────────────────────────────────────────────
step("Le rapport IA est généré", async () => {
  const report = await call("GET", `/api/ai/report/${ctx.campaignId}`, { token: ctx.token });
  assert(report.campaignId === ctx.campaignId && report.checkId, "rapport de la campagne attendu");
  assert(report.recommendation, "recommandation attendue");
  assert(report.sector, "secteur détecté attendu");
  const issues = await call("GET", `/api/ai/issues/${ctx.campaignId}`, { token: ctx.token });
  assert(Array.isArray(issues.issues), "liste des problèmes attendue");
  return `secteur ${report.sector} · ${issues.issues.length} point(s) signalé(s) · « ${report.recommendation} »`;
});

// 6 ─────────────────────────────────────────────────────────────────────────────
step("L'administrateur consulte le rapport IA", async () => {
  const report = await call("GET", `/api/ai/report/${ctx.campaignId}`, { token: ctx.admin.token });
  assert(report.campaignId === ctx.campaignId, "l'admin lit le rapport");
  const checks = await call("GET", `/api/ai/checks/${ctx.campaignId}`, { token: ctx.admin.token });
  assert(checks.length >= 1, "historique des analyses attendu");
  const decisions = items(
    await call("GET", "/api/ai/decisions", {
      token: ctx.admin.token,
      query: { campaignId: ctx.campaignId },
    }),
  );
  assert(
    decisions.some((d) => d.decisionType === "AI"),
    "décision IA journalisée attendue",
  );
  return `${checks.length} analyse(s), ${decisions.length} décision(s) journalisée(s)`;
});

// 7 ─────────────────────────────────────────────────────────────────────────────
step("Le client ouvre la carte interactive", async () => {
  const [zones, supports, recommendations] = await Promise.all([
    call("GET", "/api/zones/active", { token: ctx.token }),
    call("GET", "/api/supports", { token: ctx.token }),
    call("GET", "/api/zones/recommendations", {
      token: ctx.token,
      query: { startDate: ctx.startDate, endDate: ctx.endDate, ...ctx.slot, limit: 3 },
    }),
  ]);
  assert(zones.length > 0, "zones actives attendues (lancez scripts/seed-demo.mjs)");
  assert(supports.length > 0, "Porteurs attendus sur la carte");
  assert(Array.isArray(recommendations), "recommandations de zones attendues");
  return `${zones.length} zones, ${supports.length} Porteurs, ${recommendations.length} zone(s) recommandée(s)`;
});

// 8 ─────────────────────────────────────────────────────────────────────────────
step("Il sélectionne une zone de diffusion (point + rayon)", async () => {
  const result = await call("PUT", `/api/campaigns/${ctx.campaignId}/zones`, {
    token: ctx.token,
    body: { zones: [TARGET] },
  });
  assert(result.zones.length === 1, "un cercle enregistré attendu");
  const [zone] = result.zones;
  assert(
    Math.abs(zone.latitude - TARGET.latitude) < 1e-6 && zone.radiusKm === TARGET.radiusKm,
    "cercle enregistré",
  );
  assert(zone.supportsInside > 0, "des Porteurs dans le cercle attendus");
  return `cercle ${zone.latitude}, ${zone.longitude} r=${zone.radiusKm} km → zone « ${zone.zoneName} », ${zone.supportsInside} Porteur(s)`;
});

// 9 ─────────────────────────────────────────────────────────────────────────────
step("Il choisit une période et un créneau horaire (Soir)", async () => {
  const campaign = await call("GET", `/api/campaigns/${ctx.campaignId}`, { token: ctx.token });
  const updated = await call("PUT", `/api/campaigns/${ctx.campaignId}`, {
    token: ctx.token,
    body: {
      name: campaign.name,
      objective: campaign.objective,
      budget: campaign.budget,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      startTime: "18:00",
      endTime: "23:00",
    },
  });
  assert(
    updated.startTime === ctx.slot.startTime && updated.endTime === ctx.slot.endTime,
    "créneau Soir attendu",
  );
  return `${updated.startDate} → ${updated.endDate}, ${updated.startTime}–${updated.endTime}`;
});

// 10 ────────────────────────────────────────────────────────────────────────────
step("TPUB affiche la disponibilité des supports selon le temps choisi", async () => {
  const availability = await call("GET", "/api/availability", {
    token: ctx.token,
    query: {
      campaignId: ctx.campaignId,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      ...ctx.slot,
    },
  });
  const { summary } = availability;
  assert(summary.totalSupports === availability.supports.length, "résumé cohérent");
  const free = availability.supports.filter((s) => s.status === "DISPONIBLE");
  assert(free.length > 0, "au moins un Porteur disponible attendu");
  assert(summary.estimatedViewsAvailable > 0, "affichages disponibles estimés attendus");
  ctx.freeSupports = free;
  const statuses = availability.supports.map((s) => `${s.support.name} : ${s.status}`).join(" ; ");
  return `${summary.availableSupports}/${summary.totalSupports} disponibles, ${summary.estimatedViewsAvailable} affichages estimés${VERBOSE ? ` — ${statuses}` : ""}`;
});

// 11 ────────────────────────────────────────────────────────────────────────────
step("Il choisit les supports disponibles (réservation temporaire)", async () => {
  const chosen = ctx.freeSupports
    .filter((s) => s.support.technicalStatus === "ACTIF")
    .slice(0, 2)
    .map((s) => s.support);
  assert(chosen.length > 0, "Porteur ACTIF disponible attendu");
  const reservations = await call("POST", "/api/reservations/batch", {
    token: ctx.token,
    body: { campaignId: ctx.campaignId, supportIds: chosen.map((s) => s.id) },
  });
  assert(reservations.length === chosen.length, "une réservation par Porteur attendue");
  assert(
    reservations.every((r) => r.reservationStatus === "TEMPORAIRE"),
    "réservations TEMPORAIRE attendues",
  );
  ctx.supports = chosen;
  ctx.reservationIds = reservations.map((r) => r.id);
  return reservations.map((r) => `#${r.id} ${r.supportName}`).join(", ");
});

// 12 ────────────────────────────────────────────────────────────────────────────
step("Le système estime le budget et les affichages", async () => {
  const estimate = await call("GET", `/api/estimates/campaign/${ctx.campaignId}`, {
    token: ctx.token,
  });
  assert(estimate.lines.length === ctx.reservationIds.length, "une ligne par réservation attendue");
  assert(estimate.totalViews > 0 && estimate.totalCost > 0, "affichages et coût estimés attendus");
  const simulation = await call("POST", "/api/estimates", {
    token: ctx.token,
    body: {
      supportIds: ctx.supports.map((s) => s.id),
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      ...ctx.slot,
    },
  });
  assert(
    simulation.totalViews === estimate.totalViews,
    "simulation et estimation de campagne cohérentes",
  );
  const campaign = await call("GET", `/api/campaigns/${ctx.campaignId}`, { token: ctx.token });
  assert(
    campaign.estimatedViews === estimate.totalViews,
    "affichages estimés de la campagne à jour",
  );
  return `${estimate.totalViews} affichages, ${estimate.totalCost} TND estimés, couverture budget ${estimate.budgetCoverage}`;
});

// 13 ────────────────────────────────────────────────────────────────────────────
step("L'administrateur valide la campagne après analyse IA", async () => {
  const submitted = await call("POST", `/api/campaigns/${ctx.campaignId}/submit`, {
    token: ctx.token,
  });
  assert(
    ["APPROVED_BY_AI", "REVIEW_REQUIRED"].includes(submitted.status),
    `analyse IA favorable attendue à la soumission, reçu ${submitted.status}`,
  );
  const report = await call("GET", `/api/ai/report/${ctx.campaignId}`, { token: ctx.admin.token });
  assert(report.preview === false, "rapport IA officiel attendu après soumission");
  const validateAs = (token) =>
    call("POST", `/api/admin/campaigns/${ctx.campaignId}/validate`, {
      token,
      raw: true,
      body: {
        overrideAi: submitted.status === "REVIEW_REQUIRED",
        comment: "Contenu vérifié, diffusion autorisée.",
        priorityScore: 10,
      },
    });
  let answer = await validateAs(ctx.admin.token);
  let approvers = "";
  if (answer.status === 202 && answer.data?.pending) {
    const { approval } = answer.data;
    console.log(
      `  … ${approval.approvals.length}/${approval.approvalsRequired} approbations : validation par un second administrateur`,
    );
    answer = await validateAs((await secondAdmin()).token);
    const status = await call("GET", `/api/approvals/campaigns/${ctx.campaignId}`, {
      token: ctx.admin.token,
    }).catch(() => null);
    approvers = status?.approvals?.length
      ? ` · validée par ${approverNames(status.approvals)}`
      : "";
  }
  const validated = answer.data;
  assert(validated.adminStatus === "VALIDATED", "validation admin attendue");
  assert(
    ["VALIDATED_BY_ADMIN", "ACTIVE"].includes(validated.status),
    `statut programmé attendu, reçu ${validated.status}`,
  );
  const reservations = await call("GET", `/api/reservations/campaign/${ctx.campaignId}`, {
    token: ctx.token,
  });
  const confirmed = reservations.filter((r) => ctx.reservationIds.includes(r.id));
  assert(
    confirmed.every((r) => r.reservationStatus === "CONFIRMEE"),
    "créneaux confirmés attendus",
  );
  return `IA ${submitted.status} → admin ${validated.status}, ${confirmed.length} réservation(s) CONFIRMEE${approvers}`;
});

// 14 ────────────────────────────────────────────────────────────────────────────
step("Un support appelle l'API de diffusion", async () => {
  ctx.support = ctx.supports[0];
  // Equitable rotation: other campaigns may share this slot, so call again until ours comes up.
  for (let attempt = 1; attempt <= 12; attempt++) {
    const next = await playerCall("GET", "/api/diffusion/next", {
      supportId: ctx.support.id,
      query: { datetime: ctx.datetime },
    });
    assert(
      next.diffusionLogId && next.supportId === ctx.support.id,
      "réponse journalisée attendue",
    );
    if (next.campaignId === ctx.campaignId) {
      ctx.diffusion = next;
      ctx.attempts = attempt;
      break;
    }
  }
  assert(ctx.diffusion, "la campagne doit sortir dans la rotation");
  return `Porteur #${ctx.support.id} à ${ctx.datetime} → journal #${ctx.diffusion.diffusionLogId} (appel ${ctx.attempts})`;
});

// 15 ────────────────────────────────────────────────────────────────────────────
step("Le moteur sélectionne la bonne publicité", async () => {
  const next = ctx.diffusion;
  assert(next.type === "publicite", `type publicite attendu, reçu ${next.type}`);
  assert(
    mediaPath(next.mediaUrl) === mediaPath(ctx.mediaUrl),
    "le média de la campagne est diffusé",
  );
  assert(next.mediaType === "IMAGE" && next.duration > 0, "type de média et durée attendus");
  const outside = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
    query: { datetime: `${ctx.diffusionDate}T08:30:00` },
  });
  assert(
    outside.campaignId !== ctx.campaignId,
    "hors créneau la campagne ne doit pas être diffusée",
  );
  return `« ${next.title} » ${next.mediaType} ${next.duration} s, priorité ${next.priority} ; à 08:30 → ${outside.type}`;
});

// 16 ────────────────────────────────────────────────────────────────────────────
step("Les statistiques sont mises à jour", async () => {
  await playerCall("POST", "/api/diffusion/interactions", {
    supportId: ctx.support.id,
    body: { diffusionLogId: ctx.diffusion.diffusionLogId, type: "CLIC" },
  });
  const query = { from: ctx.diffusionDate, to: ctx.diffusionDate };
  const stats = await call("GET", `/api/statistics/campaigns/${ctx.campaignId}`, {
    token: ctx.token,
    query,
  });
  assert(
    stats.views >= 1 && stats.clicks >= 1,
    `affichage et clic attendus, reçu ${stats.views}/${stats.clicks}`,
  );
  assert(stats.consumedBudget > 0, "budget consommé attendu");
  const mine = await call("GET", "/api/statistics/mine", { token: ctx.token, query });
  assert(mine.totals.views >= 1, "tableau de bord annonceur à jour");
  const views = await call("GET", "/api/statistics/views", {
    token: ctx.admin.token,
    query: { ...query, groupBy: "campaign" },
  });
  assert(
    views.rows.some((r) => String(r.key) === String(ctx.campaignId)),
    "statistiques admin par campagne à jour",
  );
  const csv = await call("GET", "/api/statistics/export.csv", {
    token: ctx.token,
    query: { type: "campaign", campaignId: ctx.campaignId, ...query },
    raw: true,
  });
  assert(String(csv.headers.get("content-disposition")).includes(".csv"), "export CSV attendu");
  return `${stats.views} affichage(s), ${stats.clicks} clic(s), ${stats.consumedBudget} TND consommés, export CSV OK`;
});

// 17 ────────────────────────────────────────────────────────────────────────────
step("Un message d'urgence est créé", async () => {
  const emergency = await call("POST", "/api/emergency", {
    token: ctx.admin.token,
    body: {
      title: "Alerte circulation",
      content: "Avenue Habib Bourguiba fermée à la circulation : suivez la déviation.",
      latitude: ctx.support.latitude,
      longitude: ctx.support.longitude,
      radiusKm: 0.5,
      startDate: ctx.diffusionDate,
      endDate: ctx.diffusionDate,
      startTime: "19:00",
      endTime: "20:00",
      durationSeconds: 20,
      urgencyLevel: "CRITICAL",
    },
  });
  assert(
    emergency.isActive && emergency.affectedSupports >= 1,
    "message actif ciblant au moins un Porteur attendu",
  );
  let approvalNote = "";
  if (emergency.approvalStatus === "EN_ATTENTE") {
    const approved = await call("POST", `/api/emergency/${emergency.id}/approve`, {
      token: (await secondAdmin()).token,
      body: { comment: "Déviation confirmée par la circulation." },
    });
    assert(approved.approvalStatus === "APPROUVE", "approbation du second administrateur attendue");
    approvalNote = ` · approuvé par ${approverNames(approved.approvals)}`;
    Object.assign(emergency, approved);
  }
  assert(
    ["PROGRAMME", "EN_COURS"].includes(emergency.state),
    `état PROGRAMME ou EN_COURS attendu, reçu ${emergency.state}`,
  );
  ctx.emergency = emergency;
  return `urgence #${emergency.id} ${emergency.urgencyLevel} « ${emergency.title} », ${emergency.affectedSupports} Porteur(s), ${emergency.state}${approvalNote}`;
});

// 18 ────────────────────────────────────────────────────────────────────────────
step("Le message d'urgence remplace temporairement la publicité normale", async () => {
  const next = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
    query: { datetime: ctx.datetime },
  });
  assert(
    next.type === "urgence" && next.emergencyId === ctx.emergency.id,
    `urgence attendue, reçu ${next.type}`,
  );
  assert(
    next.content === ctx.emergency.content && next.duration === 20,
    "contenu et durée de l'urgence attendus",
  );
  const after = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
    query: { datetime: `${ctx.diffusionDate}T20:30:00` },
  });
  assert(after.type !== "urgence", "après la fenêtre, l'urgence ne doit plus être diffusée");
  const stopped = await call("POST", `/api/emergency/${ctx.emergency.id}/deactivate`, {
    token: ctx.admin.token,
  });
  assert(stopped.state === "DESACTIVE" && stopped.stopReason === "MANUEL", "arrêt manuel attendu");
  const back = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
    query: { datetime: ctx.datetime },
  });
  assert(back.type === "publicite", `retour à la publicité attendu, reçu ${back.type}`);
  return `urgence ${next.urgencyLevel} diffusée ${next.duration} s ; à 20:30 → ${after.type} ; après arrêt → ${back.type}`;
});

// Optional ─────────────────────────────────────────────────────────────────────
step("Supervision : l'écran signale sa présence", async () => {
  let heartbeat;
  try {
    heartbeat = await playerCall("POST", "/api/diffusion/heartbeat", {
      supportId: ctx.support.id,
      body: { playerVersion: "demo-scenario", visible: true },
    });
  } catch (err) {
    if (err.status === 404 && err.code !== "SUPPORT_NOT_FOUND") {
      return "supervision non disponible sur ce backend (étape facultative ignorée)";
    }
    throw err;
  }
  assert(heartbeat.state === "EN_LIGNE", `présence EN_LIGNE attendue, reçu ${heartbeat.state}`);
  const snapshot = await call("GET", "/api/supervision/snapshot", { token: ctx.admin.token });
  const { stats } = snapshot;
  return `${stats.onlineSupports} en ligne, ${stats.offlineSupports} hors ligne, ${stats.unknownSupports} inconnu(s), ${stats.diffusionsLastHour} diffusion(s) sur l'heure, ${stats.openAlerts} alerte(s)`;
});

async function main() {
  console.log(`Scénario de démonstration TPUB (cahier des charges §11) — ${API}`);
  const health = await fetch(`${API}/actuator/health`)
    .then((r) => r.json())
    .catch(() => null);
  if (health?.status !== "UP") {
    console.error("✘ Backend injoignable : lancez start-local.ps1 puis scripts/seed-demo.mjs.");
    process.exit(1);
  }
  console.log(
    `Fenêtre simulée : ${ctx.startDate} → ${ctx.endDate}, créneau Soir ; diffusion à ${ctx.datetime}\n`,
  );
  let failed = 0;
  for (const [index, { title, run }] of STEPS.entries()) {
    const label = `${String(index + 1).padStart(2, " ")}. ${title}`;
    if (failed) {
      console.log(`✘ ${label} — non exécutée (étape précédente en échec)`);
      continue;
    }
    try {
      const detail = await run();
      console.log(`✔ ${label}${detail ? ` — ${detail}` : ""}`);
    } catch (err) {
      if (err instanceof SetupError) {
        console.error(err.message);
        process.exit(1);
      }
      failed++;
      console.log(`✘ ${label} — ${err.message}`);
      if (VERBOSE && err.data) console.log(JSON.stringify(err.data, null, 2));
    }
  }
  console.log(
    failed
      ? "\nScénario en échec."
      : `\nScénario complet : ${STEPS.length}/${STEPS.length} étapes validées.`,
  );
  if (!failed) {
    console.log(`  Annonceur créé : ${ctx.advertiser.email} / ${ctx.advertiser.password}`);
    console.log(
      `  Campagne #${ctx.campaignId} · lecteur : http://localhost:3000/ecran/${ctx.support.id}?datetime=${ctx.datetime} (clé d'appareil : ${DEVICE_KEYS_FILE})`,
    );
  }
  process.exit(failed ? 1 : 0);
}

void main();
