#!/usr/bin/env node
/**
 * Checks every round-2 feature (docs/round2-contract.md) end to end over HTTP against a running
 * TPUB backend, one ✔ / ✘ line per feature. Companion of demo-scenario.mjs, which covers the 18
 * steps of the cahier des charges §11.
 *
 * Covered: real OCR (Tesseract) on a PNG whose text is drawn by this script, local image metrics,
 * video frame analysis on scripts/fixtures/demo-clip.mp4, dynamic pricing (off-peak vs peak),
 * polygon zones and their enforcement, heatmaps, PDF and Excel exports, two-administrator approval
 * of a campaign and of an emergency, staff notifications, SSE supervision stream, device keys,
 * signed media URLs, simulated time, TOTP enrolment and login, and the learning recalibration.
 *
 * Prerequisites: backend started (start-local.ps1, profile `local`) and network seeded
 * (node scripts/seed-demo.mjs). Everything it creates is left in a harmless state: the test
 * campaigns are blocked, the emergency is deactivated and the throwaway advertiser keeps its 2FA.
 *
 * Usage: node scripts/bonus-scenario.mjs [--verbose]   (TPUB_API_URL defaults to http://localhost:8080)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adminCredentials,
  demoPassword,
  DEVICE_KEY_HEADER,
  deviceKeyFor,
  generatePassword,
  login,
  SetupError,
} from "./lib/demo-auth.mjs";
import { totp } from "./lib/totp.mjs";
import { API, call, day, fileForm, items, makeTextPng, SLOT_PRESETS } from "./lib/tpub-api.mjs";

const VERBOSE = process.argv.includes("--verbose");
const SECOND_ADMIN_EMAIL = "admin2@tpub.local";
const OPERATOR_EMAIL = "operateur@tpub.local";
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
/** Words drawn into the PNG the real OCR must read back. */
const OCR_LINES = ["SOLDES", "LIBRAIRIE", "TUNIS 2026"];
/** Rule seeded by V3 whose HIGH severity always sends a campaign to REVIEW_REQUIRED. */
const LEARNING_RULE = { name: "allegations-miracles", keyword: "miracle" };
/** Feedback rows the recalibration needs before it may move a threshold (ai.learning.min-feedback). */
const MIN_FEEDBACK = 20;

class AssertionError extends Error {}
function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

async function expectError(promise, code, what) {
  try {
    await promise;
  } catch (err) {
    assert(err.code === code, `${what} : ${code} attendu, reçu ${err.code ?? err.status}`);
    return err;
  }
  throw new AssertionError(`${what} : ${code} attendu, aucune erreur reçue`);
}

/** Waits for the next 30-second TOTP step, so a code is never replayed (RFC 6238). */
async function nextTotpStep() {
  const step = 30_000;
  await new Promise((resolve) => setTimeout(resolve, step - (Date.now() % step) + 1000));
}

const STEPS = [];
function step(title, run) {
  STEPS.push({ title, run });
}

const ctx = {
  runId: Date.now(),
  offset: 90 + (Math.floor(Date.now() / 1000) % 40),
};
ctx.startDate = day(ctx.offset);
ctx.endDate = day(ctx.offset + 3);

/** Player call carrying the device key of the Porteur (round 2 §3.3). */
function playerCall(method, path, { supportId, query, body, key } = {}) {
  return call(method, path, {
    query: { supportId, ...query },
    body,
    headers: key === null ? {} : { [DEVICE_KEY_HEADER]: key ?? ctx.deviceKey },
  });
}

/**
 * Draft campaign of the throwaway advertiser, with an optional objective and window (the window is
 * shifted when several campaigns must book the same Porteur without colliding).
 */
async function draftCampaign(name, objective, window = {}) {
  return call("POST", "/api/campaigns", {
    token: ctx.advertiser.token,
    body: {
      name,
      objective:
        objective ??
        "Campagne du scénario bonus : présenter les nouveautés de la librairie aux familles du quartier.",
      budget: 60,
      startDate: window.startDate ?? ctx.startDate,
      endDate: window.endDate ?? ctx.endDate,
      startTime: SLOT_PRESETS.SOIR.startTime,
      endTime: SLOT_PRESETS.SOIR.endTime,
    },
  });
}

/**
 * First window of `lengthDays` days from `offset` on which the Porteur still has capacity, so a
 * replay of the scenario never collides with the reservations of an earlier run.
 */
async function freeWindow(support, offset, lengthDays = 2) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const startDate = day(offset + attempt * (lengthDays + 2));
    const endDate = day(offset + attempt * (lengthDays + 2) + lengthDays);
    const availability = await call("GET", "/api/availability", {
      token: ctx.advertiser.token,
      query: {
        startDate,
        endDate,
        startTime: SLOT_PRESETS.SOIR.startTime,
        endTime: SLOT_PRESETS.SOIR.endTime,
        lat: support.latitude,
        lng: support.longitude,
        radiusKm: 0.5,
      },
    });
    const line = (availability.supports ?? []).find((s) => s.support?.id === support.id);
    if (line?.status === "DISPONIBLE" && line.remainingCapacity > 0) return { startDate, endDate };
  }
  throw new AssertionError(
    `aucune fenêtre libre trouvée pour le Porteur #${support.id} à partir de J+${offset}`,
  );
}

// 1 ─────────────────────────────────────────────────────────────────────────────
step("Comptes et réseau de démonstration", async () => {
  ctx.admin = await login(adminCredentials());
  const admin2Password = demoPassword(SECOND_ADMIN_EMAIL, { create: false });
  assert(
    admin2Password,
    `mot de passe de ${SECOND_ADMIN_EMAIL} absent : lancez scripts/seed-demo.mjs`,
  );
  ctx.admin2 = await login({ email: SECOND_ADMIN_EMAIL, password: admin2Password });
  const operatorPassword = demoPassword(OPERATOR_EMAIL, { create: false });
  assert(
    operatorPassword,
    `mot de passe de ${OPERATOR_EMAIL} absent : lancez scripts/seed-demo.mjs`,
  );
  ctx.operator = await login({ email: OPERATOR_EMAIL, password: operatorPassword });

  ctx.advertiser = await call("POST", "/api/auth/register", {
    body: {
      email: `bonus.${ctx.runId}@annonceur.tn`,
      password: generatePassword(),
      nom: "Bonus Testeur",
      societe: "Bonus SARL",
    },
  });
  ctx.advertiserEmail = ctx.advertiser.email;

  const supports = items(await call("GET", "/api/supports", { token: ctx.admin.token }));
  const inZone = supports.filter((s) => s.technicalStatus === "ACTIF" && s.zoneId);
  assert(
    inZone.length >= 2,
    "au moins deux Porteurs ACTIF attendus : lancez scripts/seed-demo.mjs",
  );
  ctx.support = inZone[0];
  ctx.otherSupport =
    inZone.find((s) => s.zoneId !== ctx.support.zoneId) ??
    inZone.find((s) => s.id !== ctx.support.id);
  ctx.deviceKey = await deviceKeyFor(ctx.support.id, ctx.admin.token);
  return `admin + ${SECOND_ADMIN_EMAIL} + ${OPERATOR_EMAIL}, annonceur ${ctx.advertiserEmail}, Porteur #${ctx.support.id}`;
});

// 2 ─────────────────────────────────────────────────────────────────────────────
step("OCR réel : Tesseract lit le texte d'une image générée", async () => {
  const campaign = await draftCampaign(`Bonus OCR ${ctx.runId}`);
  ctx.ocrCampaignId = campaign.id;
  const png = makeTextPng(OCR_LINES, { scale: 14 });
  const media = await call("POST", `/api/campaigns/${campaign.id}/media`, {
    token: ctx.advertiser.token,
    form: fileForm(png, "bonus-ocr.png", "image/png"),
  });
  ctx.mediaUrl = media.url;
  const report = await call("POST", `/api/ai/check-content/${campaign.id}`, {
    token: ctx.advertiser.token,
  });
  const analysis = (report.mediaAnalyses ?? [])[0];
  assert(analysis, "analyse média attendue dans le rapport IA");
  assert(
    analysis.ocrEngine === "TESSERACT",
    `moteur OCR TESSERACT attendu, reçu ${analysis.ocrEngine} (lancez BackEnd/scripts/fetch-tessdata.ps1)`,
  );
  const text = `${analysis.extractedText ?? ""} ${report.extractedText ?? ""}`.toUpperCase();
  const read = OCR_LINES.flatMap((line) => line.split(" ")).filter((word) => text.includes(word));
  assert(read.length > 0, `aucun mot reconnu dans « ${text.trim().slice(0, 80)} »`);
  ctx.ocrAnalysis = analysis;
  return `${analysis.ocrEngine} (confiance ${analysis.ocrConfidence ?? "?"}) a lu ${read.join(", ")}`;
});

// 3 ─────────────────────────────────────────────────────────────────────────────
step("Analyse d'image locale : dimensions, netteté, couverture de texte", async () => {
  const metrics = ctx.ocrAnalysis?.metrics;
  assert(metrics, "métriques d'image attendues");
  assert(metrics.width > 0 && metrics.height > 0, "dimensions attendues");
  assert(typeof metrics.sharpness === "number", "netteté (variance du laplacien) attendue");
  assert(
    typeof metrics.brightness === "number" && typeof metrics.contrast === "number",
    "luminosité et contraste attendus",
  );
  assert(metrics.textCoverage > 0, "couverture de texte > 0 attendue sur une image de texte");
  assert((metrics.dominantColors ?? []).length > 0, "couleurs dominantes attendues");
  return `${metrics.width}×${metrics.height} ${metrics.aspectFit} · netteté ${metrics.sharpness} · texte ${(metrics.textCoverage * 100).toFixed(1)} % · ${metrics.dominantColors.length} couleur(s)`;
});

// 4 ─────────────────────────────────────────────────────────────────────────────
step("Analyse vidéo : images extraites d'un MP4 et miniature", async () => {
  const campaign = await draftCampaign(`Bonus vidéo ${ctx.runId}`);
  ctx.videoCampaignId = campaign.id;
  const mp4 = readFileSync(join(FIXTURES, "demo-clip.mp4"));
  await call("POST", `/api/campaigns/${campaign.id}/media`, {
    token: ctx.advertiser.token,
    form: fileForm(mp4, "demo-clip.mp4", "video/mp4"),
  });
  const report = await call("POST", `/api/ai/check-content/${campaign.id}`, {
    token: ctx.advertiser.token,
  });
  const analysis = (report.mediaAnalyses ?? []).find((m) => m.contentType === "VIDEO");
  assert(analysis, "analyse vidéo attendue");
  assert(analysis.videoSupported === true, "MP4 analysable attendu (JCodec)");
  assert(analysis.containerDurationSeconds > 0, "durée du conteneur attendue");
  const frames = analysis.frames ?? [];
  assert(frames.length >= 2, `au moins deux images extraites attendues, reçu ${frames.length}`);
  assert(
    frames.every((f) => f.metrics),
    "métriques par image attendues",
  );
  return `${frames.length} image(s) (${frames.map((f) => f.label).join(", ")}) · ${analysis.containerDurationSeconds} s · miniature ${analysis.thumbnailUrl ? "oui" : "non"}`;
});

// 5 ─────────────────────────────────────────────────────────────────────────────
step("Tarification dynamique : le multiplicateur change entre creux et pointe", async () => {
  const config = await call("GET", "/api/pricing/config", { token: ctx.advertiser.token });
  assert(
    (config.hourBands ?? []).length > 0,
    "tranches horaires attendues dans /api/pricing/config",
  );
  const estimate = async (startTime, endTime) =>
    call("POST", "/api/estimates", {
      token: ctx.advertiser.token,
      body: {
        supportIds: [ctx.support.id],
        startDate: ctx.startDate,
        endDate: ctx.endDate,
        startTime,
        endTime,
      },
    });
  const offPeak = await estimate("02:00:00", "06:00:00");
  const peak = await estimate("16:00:00", "20:00:00");
  const line = (e) => (e.lines ?? [])[0];
  const offLine = line(offPeak);
  const peakLine = line(peak);
  assert(
    offLine?.pricing && peakLine?.pricing,
    "détail du prix (PriceBreakdown) attendu par Porteur",
  );
  assert(
    peakLine.pricing.multiplier > offLine.pricing.multiplier,
    `multiplicateur de pointe (${peakLine.pricing.multiplier}) attendu supérieur au creux (${offLine.pricing.multiplier})`,
  );
  assert(offLine.baseCost > 0, "coût de base attendu");
  return `creux ×${offLine.pricing.multiplier} vs pointe ×${peakLine.pricing.multiplier} (base ${offLine.baseCost} TND)`;
});

// 6 ─────────────────────────────────────────────────────────────────────────────
step("Zones polygonales : tracé accepté et Porteur hors polygone refusé", async () => {
  const campaign = await draftCampaign(
    `Bonus polygone ${ctx.runId}`,
    undefined,
    await freeWindow(ctx.support, ctx.offset),
  );
  ctx.polygonCampaignId = campaign.id;
  const { latitude, longitude } = ctx.support;
  const d = 0.01; // ≈ 1,1 km : un carré autour du Porteur ciblé
  const ring = [
    [longitude - d, latitude - d],
    [longitude + d, latitude - d],
    [longitude + d, latitude + d],
    [longitude - d, latitude + d],
    [longitude - d, latitude - d],
  ];
  const zones = await call("PUT", `/api/campaigns/${campaign.id}/zones`, {
    token: ctx.advertiser.token,
    body: {
      zones: [
        {
          type: "POLYGONE",
          polygon: { type: "Polygon", coordinates: [ring] },
          label: "Carré bonus",
        },
      ],
    },
  });
  const zone = (zones.zones ?? zones)[0];
  assert(zone.type === "POLYGONE", "zone de type POLYGONE attendue");
  assert(zone.areaKm2 > 0, "aire du polygone attendue");
  assert(zone.polygon?.type === "Polygon", "géométrie GeoJSON renvoyée attendue");

  await expectError(
    call("PUT", `/api/campaigns/${campaign.id}/zones`, {
      token: ctx.advertiser.token,
      body: {
        zones: [
          {
            type: "POLYGONE",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [0.0001, 0],
                  [0.0001, 0.0001],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
    }),
    "INVALID_POLYGON",
    "polygone minuscule",
  );
  // The polygon was replaced by nothing: put it back before reserving.
  await call("PUT", `/api/campaigns/${campaign.id}/zones`, {
    token: ctx.advertiser.token,
    body: { zones: [{ type: "POLYGONE", polygon: { type: "Polygon", coordinates: [ring] } }] },
  });

  const inside = await call("POST", "/api/reservations", {
    token: ctx.advertiser.token,
    body: { campaignId: campaign.id, supportId: ctx.support.id },
  });
  assert(
    inside.reservationStatus === "TEMPORAIRE",
    `réservation TEMPORAIRE du Porteur intérieur attendue, reçu ${inside.reservationStatus}`,
  );
  await expectError(
    call("POST", "/api/reservations", {
      token: ctx.advertiser.token,
      body: { campaignId: campaign.id, supportId: ctx.otherSupport.id },
    }),
    "SUPPORT_OUTSIDE_CAMPAIGN_ZONE",
    "Porteur hors polygone",
  );
  return `polygone ${zone.areaKm2} km² · Porteur #${ctx.support.id} réservé, Porteur #${ctx.otherSupport.id} refusé`;
});

// 7 ─────────────────────────────────────────────────────────────────────────────
step("Cartes de chaleur : diffusions, demande et demande publique", async () => {
  const diffusions = await call("GET", "/api/heatmap/diffusions", { token: ctx.admin.token });
  assert(
    diffusions.points?.type === "FeatureCollection",
    "FeatureCollection attendue pour les diffusions",
  );
  const demand = await call("GET", "/api/heatmap/demand", { token: ctx.admin.token });
  assert(demand.reservations?.type === "FeatureCollection", "points de réservation attendus");
  assert(Array.isArray(demand.byZone), "agrégat par zone attendu");
  const publicDemand = await call("GET", "/api/heatmap/demand/public", {
    token: ctx.advertiser.token,
    query: {
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      startTime: SLOT_PRESETS.SOIR.startTime,
      endTime: SLOT_PRESETS.SOIR.endTime,
    },
  });
  assert(publicDemand.points?.type === "FeatureCollection", "demande publique attendue");
  await expectError(
    call("GET", "/api/heatmap/diffusions", {
      token: ctx.admin.token,
      query: { from: day(0), to: day(-10) },
    }),
    "INVALID_RANGE",
    "période inversée",
  );
  return `${diffusions.points.features.length} point(s) de diffusion · ${demand.byZone.length} zone(s) · ${publicDemand.points.features.length} Porteur(s) publics`;
});

// 8 ─────────────────────────────────────────────────────────────────────────────
step("Exports PDF et Excel des statistiques", async () => {
  const query = { type: "views", from: day(-30), to: day(0), groupBy: "day" };
  const pdf = await call("GET", "/api/statistics/export.pdf", {
    token: ctx.admin.token,
    query,
    raw: true,
  });
  assert(Buffer.isBuffer(pdf.data), "corps binaire attendu pour le PDF");
  assert(pdf.data.subarray(0, 4).toString("latin1") === "%PDF", "en-tête %PDF attendu");
  const xlsx = await call("GET", "/api/statistics/export.xlsx", {
    token: ctx.admin.token,
    query,
    raw: true,
  });
  assert(Buffer.isBuffer(xlsx.data), "corps binaire attendu pour le classeur");
  assert(xlsx.data.subarray(0, 2).toString("latin1") === "PK", "en-tête ZIP (PK) attendu");
  await expectError(
    call("GET", "/api/statistics/export.pdf", {
      token: ctx.admin.token,
      query: { ...query, type: "inconnu" },
    }),
    "EXPORT_TYPE_INVALID",
    "type d'export inconnu",
  );
  return `PDF ${(pdf.data.length / 1024).toFixed(1)} Ko · XLSX ${(xlsx.data.length / 1024).toFixed(1)} Ko`;
});

// 9 ─────────────────────────────────────────────────────────────────────────────
step("Clé d'appareil : diffusion refusée sans clé valide", async () => {
  await expectError(
    playerCall("GET", "/api/diffusion/next", { supportId: ctx.support.id, key: null }),
    "DEVICE_KEY_REQUIRED",
    "appel sans clé",
  );
  await expectError(
    playerCall("GET", "/api/diffusion/next", { supportId: ctx.support.id, key: "tpd_faux" }),
    "DEVICE_KEY_INVALID",
    "appel avec une clé invalide",
  );
  const ok = await playerCall("GET", "/api/diffusion/next", { supportId: ctx.support.id });
  assert(ok.type, "diffusion attendue avec la clé appairée");
  ctx.lastDiffusion = ok;
  return `sans clé → 401 DEVICE_KEY_REQUIRED, clé fausse → 401 DEVICE_KEY_INVALID, clé appairée → ${ok.type}`;
});

// 10 ────────────────────────────────────────────────────────────────────────────
step("Heure simulée : honorée en profil local, ignorée sinon", async () => {
  const datetime = `${day(1)}T21:15:00`;
  const answer = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
    query: { datetime },
  });
  assert(typeof answer.simulatedTime === "boolean", "drapeau simulatedTime attendu");
  if (answer.simulatedTime) {
    assert(answer.datetime?.startsWith(day(1)), "date simulée attendue dans la réponse");
    return `datetime=${datetime} honoré (profil local), diffusion ${answer.type}`;
  }
  return "horloge serveur utilisée (tpub.diffusion.simulated-time-enabled=false) — couvert par DiffusionSimulatedTimeTest";
});

// 11 ────────────────────────────────────────────────────────────────────────────
step("Médias signés : URL signée acceptée, non signée ou expirée refusée", async () => {
  assert(ctx.mediaUrl, "URL de média attendue de l'étape OCR");
  const signed = new URL(`${API}${ctx.mediaUrl}`);
  const ok = await fetch(signed, { headers: { Authorization: `Bearer ${ctx.advertiser.token}` } });
  assert(ok.status === 200, `média signé attendu 200, reçu ${ok.status}`);

  const unsigned = new URL(signed);
  unsigned.search = "";
  const refused = await fetch(unsigned);
  assert(refused.status === 403, `média non signé attendu 403, reçu ${refused.status}`);
  const refusedBody = await refused.json().catch(() => null);
  assert(
    refusedBody?.code === "MEDIA_SIGNATURE_REQUIRED",
    `MEDIA_SIGNATURE_REQUIRED attendu, reçu ${refusedBody?.code}`,
  );

  const expired = new URL(signed);
  expired.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 3600));
  const expiredResponse = await fetch(expired);
  const expiredBody = await expiredResponse.json().catch(() => null);
  assert(
    expiredResponse.status === 403,
    `média expiré attendu 403, reçu ${expiredResponse.status}`,
  );
  assert(
    ["MEDIA_URL_EXPIRED", "MEDIA_SIGNATURE_INVALID"].includes(expiredBody?.code),
    `expiration refusée attendue, reçu ${expiredBody?.code}`,
  );

  const traversal = await fetch(`${API}/uploads/%2e%2e%2f%2e%2e%2fapplication.yml?exp=1&sig=1`);
  assert(
    [400, 403, 404].includes(traversal.status),
    `traversée de chemin refusée attendue, reçu ${traversal.status}`,
  );
  return `signée 200 · non signée 403 MEDIA_SIGNATURE_REQUIRED · expirée 403 ${expiredBody?.code}`;
});

// 12 ────────────────────────────────────────────────────────────────────────────
step("Flux SSE de supervision : instantané puis événement de diffusion", async () => {
  const controller = new AbortController();
  const response = await fetch(`${API}/api/realtime/supervision`, {
    headers: { Authorization: `Bearer ${ctx.admin.token}`, Accept: "text/event-stream" },
    signal: controller.signal,
  });
  assert(response.status === 200, `flux SSE attendu 200, reçu ${response.status}`);
  assert(
    (response.headers.get("content-type") ?? "").includes("text/event-stream"),
    "content-type text/event-stream attendu",
  );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const seen = new Set();
  const deadline = Date.now() + 25_000;
  let buffer = "";
  let triggered = false;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3000)),
      ]);
      if (chunk?.value) buffer += decoder.decode(chunk.value, { stream: true });
      for (const match of buffer.matchAll(/^event: ?(\S+)$/gm)) seen.add(match[1]);
      if (!triggered && seen.has("snapshot")) {
        triggered = true;
        // A player call writes a diffusion log, which the hub relays after commit.
        await playerCall("GET", "/api/diffusion/next", { supportId: ctx.support.id });
      }
      if (seen.has("snapshot") && (seen.has("diffusion") || seen.has("presence"))) break;
    }
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
  assert(seen.has("snapshot"), "événement « snapshot » attendu en ouverture du flux");
  assert(
    seen.has("diffusion") || seen.has("presence"),
    `événement « diffusion » attendu après un appel lecteur, reçus : ${[...seen].join(", ") || "aucun"}`,
  );
  assert(buffer.includes("retry:"), "directive retry attendue en ouverture");
  return `événements reçus : ${[...seen].join(", ")}`;
});

// 13 ────────────────────────────────────────────────────────────────────────────
step("Double validation : la campagne attend un second administrateur", async () => {
  const campaign = await draftCampaign(
    `Bonus double validation ${ctx.runId}`,
    `Offre miracle du scénario bonus ${ctx.runId}.`,
    // Own window: step 6 has already booked this Porteur.
    await freeWindow(ctx.support, ctx.offset + 10),
  );
  await call("PUT", `/api/campaigns/${campaign.id}/zones`, {
    token: ctx.advertiser.token,
    body: {
      zones: [
        {
          latitude: ctx.support.latitude,
          longitude: ctx.support.longitude,
          radiusKm: 1,
        },
      ],
    },
  });
  await call("POST", "/api/reservations", {
    token: ctx.advertiser.token,
    body: { campaignId: campaign.id, supportId: ctx.support.id },
  });
  const submitted = await call("POST", `/api/campaigns/${campaign.id}/submit`, {
    token: ctx.advertiser.token,
  });
  assert(
    submitted.status === "REVIEW_REQUIRED",
    `REVIEW_REQUIRED attendu (règle ${LEARNING_RULE.name}), reçu ${submitted.status}`,
  );
  const first = await call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
    token: ctx.admin.token,
    body: { overrideAi: true, comment: "Scénario bonus : première approbation." },
    raw: true,
  });
  assert(first.status === 202, `202 (approbation en attente) attendu, reçu ${first.status}`);
  assert(first.data.pending === true, "pending: true attendu");
  const pending = await call("GET", "/api/approvals/pending", { token: ctx.admin2.token });
  assert(
    (pending.campaigns ?? []).some((c) => c.campaignId === campaign.id),
    "campagne attendue dans les approbations en attente",
  );
  await expectError(
    call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
      token: ctx.admin.token,
      body: { overrideAi: true },
    }),
    "APPROVAL_ALREADY_GIVEN",
    "seconde approbation du même administrateur",
  );
  const second = await call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
    token: ctx.admin2.token,
    body: { overrideAi: true, comment: "Scénario bonus : seconde approbation." },
    raw: true,
  });
  assert(second.status === 200, `200 attendu à la seconde approbation, reçu ${second.status}`);
  assert(
    ["VALIDATED_BY_ADMIN", "ACTIVE"].includes(second.data.status),
    `campagne validée attendue, reçu ${second.data.status}`,
  );
  ctx.approvalCampaignId = campaign.id;
  return `1re approbation → 202, 2e (admin2) → 200 ${second.data.status}`;
});

// 14 ────────────────────────────────────────────────────────────────────────────
step("Urgence : diffusée seulement après deux approbations", async () => {
  const emergency = await call("POST", "/api/emergency", {
    token: ctx.admin.token,
    body: {
      title: `Bonus urgence ${ctx.runId}`,
      content: "Test du scénario bonus : approbation à deux administrateurs.",
      zoneId: ctx.support.zoneId,
      startDate: day(0),
      endDate: day(0),
      urgencyLevel: "CRITICAL",
      durationSeconds: 10,
    },
  });
  ctx.emergencyId = emergency.id;
  assert(
    emergency.state === "EN_ATTENTE_APPROBATION",
    `EN_ATTENTE_APPROBATION attendu, reçu ${emergency.state}`,
  );
  const beforeApproval = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
  });
  assert(
    beforeApproval.emergencyId !== emergency.id,
    "le message en attente d'approbation ne doit pas être diffusé",
  );
  await expectError(
    call("POST", `/api/emergency/${emergency.id}/approve`, { token: ctx.admin.token }),
    "APPROVAL_ALREADY_GIVEN",
    "approbation par le créateur",
  );
  const approved = await call("POST", `/api/emergency/${emergency.id}/approve`, {
    token: ctx.admin2.token,
    body: { comment: "Scénario bonus." },
  });
  assert(approved.approvals?.length >= 2, "deux approbations attendues");
  assert(approved.state !== "EN_ATTENTE_APPROBATION", "urgence approuvée attendue");
  const afterApproval = await playerCall("GET", "/api/diffusion/next", {
    supportId: ctx.support.id,
  });
  assert(
    afterApproval.type === "urgence" && afterApproval.emergencyId === emergency.id,
    `diffusion du message approuvé attendue, reçu ${afterApproval.type} #${afterApproval.emergencyId}`,
  );
  return `avant : ${beforeApproval.type} · après 2 approbations : ${afterApproval.type} (${approved.approvals.length} approbations)`;
});

// 15 ────────────────────────────────────────────────────────────────────────────
step("Notifications : l'opérateur est prévenu de la diffusion d'urgence", async () => {
  const unread = await call("GET", "/api/notifications/unread-count", {
    token: ctx.operator.token,
  });
  assert(typeof unread.count === "number", "compteur de non-lues attendu");
  const page = await call("GET", "/api/notifications", {
    token: ctx.operator.token,
    query: { unreadOnly: true, size: 20 },
  });
  const notification = items(page).find(
    (n) => n.type === "EMERGENCY_BROADCAST" && String(n.entityId) === String(ctx.emergencyId),
  );
  assert(notification, "notification EMERGENCY_BROADCAST attendue pour l'opérateur");
  await call("POST", `/api/notifications/${notification.id}/read`, { token: ctx.operator.token });
  const after = await call("GET", "/api/notifications/unread-count", { token: ctx.operator.token });
  assert(
    after.count < unread.count,
    `compteur décrémenté attendu après lecture (${unread.count} → ${after.count})`,
  );
  return `${unread.count} non-lue(s) → « ${notification.title} » lue, reste ${after.count}`;
});

// 16 ────────────────────────────────────────────────────────────────────────────
step("Double authentification : activation TOTP puis connexion en deux temps", async () => {
  const password = generatePassword();
  const account = await call("POST", "/api/auth/register", {
    body: { email: `bonus.2fa.${ctx.runId}@annonceur.tn`, password, nom: "Bonus TOTP" },
  });
  const setup = await call("POST", "/api/me/2fa/setup", { token: account.token });
  assert(
    setup.secret && setup.otpauthUri?.startsWith("otpauth://totp/"),
    "secret et URI otpauth attendus",
  );
  const enabled = await call("POST", "/api/me/2fa/enable", {
    token: account.token,
    body: { code: totp(setup.secret) },
  });
  assert((enabled.recoveryCodes ?? []).length === 10, "10 codes de secours attendus");
  const status = await call("GET", "/api/me/2fa", { token: account.token });
  assert(status.enabled === true, "double authentification active attendue");

  const challenge = await call("POST", "/api/auth/login", {
    body: { email: account.email, password },
  });
  assert(challenge.status === "TOTP_REQUIRED", `TOTP_REQUIRED attendu, reçu ${challenge.status}`);
  assert(!challenge.token, "aucun jeton attendu avant le second facteur");
  await expectError(
    call("POST", "/api/auth/login/verify", {
      body: { challengeToken: challenge.challengeToken, code: "000000" },
    }),
    "TOTP_CODE_INVALID",
    "code TOTP erroné",
  );
  // A TOTP step already used (here by the enrolment) is refused as a replay: wait for the next one.
  await nextTotpStep();
  const verified = await call("POST", "/api/auth/login/verify", {
    body: { challengeToken: challenge.challengeToken, code: totp(setup.secret) },
  });
  assert(
    verified.status === "AUTHENTICATED" && verified.token,
    "session ouverte attendue après le code",
  );
  return `secret enrôlé, code erroné refusé, code calculé accepté (${enabled.recoveryCodes.length} codes de secours)`;
});

// 17 ────────────────────────────────────────────────────────────────────────────
step("Apprentissage : les décisions administrateur recalibrent l'IA", async () => {
  const before = items(await call("GET", "/api/ai/calibrations", { token: ctx.admin.token }))[0];
  const quality = await call("GET", "/api/ai/quality", { token: ctx.admin.token });
  const existing = quality.totalDecisions ?? quality.feedbackCount ?? 0;
  const missing = Math.max(0, MIN_FEEDBACK + 1 - existing);
  const created = [];
  for (let i = 0; i < missing; i++) {
    const campaign = await draftCampaign(
      `Bonus apprentissage ${ctx.runId}-${i}`,
      // One flagged word only: two rules at once would push the risk above the rejection threshold.
      `Offre miracle du scénario bonus ${ctx.runId}-${i}.`,
      // One free window per campaign: the same Porteur cannot be booked twice on one slot.
      await freeWindow(ctx.support, ctx.offset + 30 + i * 8),
    );
    await call("PUT", `/api/campaigns/${campaign.id}/zones`, {
      token: ctx.advertiser.token,
      body: {
        zones: [{ latitude: ctx.support.latitude, longitude: ctx.support.longitude, radiusKm: 1 }],
      },
    });
    await call("POST", "/api/reservations", {
      token: ctx.advertiser.token,
      body: { campaignId: campaign.id, supportId: ctx.support.id },
    });
    const submitted = await call("POST", `/api/campaigns/${campaign.id}/submit`, {
      token: ctx.advertiser.token,
    });
    assert(
      submitted.status === "REVIEW_REQUIRED",
      `REVIEW_REQUIRED attendu pour la campagne d'apprentissage, reçu ${submitted.status}`,
    );
    // Override of the AI flag by two administrators: one false positive per campaign.
    await call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
      token: ctx.admin.token,
      body: { overrideAi: true, comment: "Scénario bonus : faux positif." },
      raw: true,
    });
    await call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
      token: ctx.admin2.token,
      body: { overrideAi: true, comment: "Scénario bonus : faux positif." },
      raw: true,
    });
    created.push(campaign.id);
  }
  ctx.learningCampaigns = created;

  const calibration = await call("POST", "/api/ai/calibrations/recalibrate", {
    token: ctx.admin.token,
  });
  assert(calibration.version > (before?.version ?? 0), "nouvelle version de calibration attendue");
  assert(
    calibration.feedbackCount >= MIN_FEEDBACK,
    `au moins ${MIN_FEEDBACK} retours attendus, reçu ${calibration.feedbackCount}`,
  );
  const movedThreshold =
    calibration.approveThreshold !== (before?.approveThreshold ?? 31) ||
    calibration.rejectThreshold !== (before?.rejectThreshold ?? 70);
  const weights = calibration.ruleWeights ?? {};
  const movedWeight = Object.values(weights).some((w) => Number(w) !== 1);
  assert(
    movedThreshold || movedWeight,
    `seuil ou poids modifié attendu (A ${calibration.approveThreshold}, R ${calibration.rejectThreshold}, poids ${JSON.stringify(weights)})`,
  );
  const quality2 = await call("GET", "/api/ai/quality", { token: ctx.admin.token });
  assert(typeof quality2.falsePositiveRate === "number", "taux de faux positifs attendu");
  return `v${calibration.version} : revue dès ${calibration.approveThreshold}, refus au-delà de ${calibration.rejectThreshold}, ${calibration.feedbackCount} retours, ${Object.keys(weights).length} poids appris (${missing} décision(s) ajoutée(s))`;
});

// 18 ────────────────────────────────────────────────────────────────────────────
step("Nettoyage : urgence désactivée et campagnes de test bloquées", async () => {
  if (ctx.emergencyId) {
    await call("POST", `/api/emergency/${ctx.emergencyId}/deactivate`, { token: ctx.admin.token });
  }
  const toBlock = [ctx.approvalCampaignId, ...(ctx.learningCampaigns ?? [])].filter(Boolean);
  let blocked = 0;
  for (const id of toBlock) {
    try {
      await call("POST", `/api/admin/campaigns/${id}/reject`, {
        token: ctx.admin.token,
        body: { reason: "Campagne du scénario bonus : retirée de la diffusion." },
      });
      blocked++;
    } catch (err) {
      if (VERBOSE) console.log(`  campagne ${id} non bloquée : ${err.message}`);
    }
  }
  return `urgence désactivée, ${blocked}/${toBlock.length} campagne(s) de test bloquée(s)`;
});

async function main() {
  console.log(`Scénario bonus TPUB (fonctionnalités round 2) — ${API}`);
  const health = await fetch(`${API}/actuator/health`)
    .then((r) => r.json())
    .catch(() => null);
  if (health?.status !== "UP") {
    console.error("✘ Backend injoignable : lancez start-local.ps1 puis scripts/seed-demo.mjs.");
    process.exit(1);
  }
  console.log(`Fenêtre de test : ${ctx.startDate} → ${ctx.endDate}\n`);
  let failed = 0;
  for (const [index, { title, run }] of STEPS.entries()) {
    const label = `${String(index + 1).padStart(2, " ")}. ${title}`;
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
      ? `\nScénario bonus : ${STEPS.length - failed}/${STEPS.length} vérifications passées.`
      : `\nScénario bonus complet : ${STEPS.length}/${STEPS.length} vérifications passées.`,
  );
  process.exit(failed ? 1 : 0);
}

void main();
