#!/usr/bin/env node
/**
 * Seeds a running TPUB backend with demo data for the v2 API:
 * - zones and Porteurs (supports) with every technical status, Porteur characteristics and
 *   visibility scores, plus one maintenance block;
 * - staff accounts (OPERATEUR, SUPERVISEUR) and a validated demo advertiser;
 * - extra moderation rules on top of the 8 seeded by migration V3;
 * - demo campaigns created through the real flow (details → image → map circles → reservations →
 *   submit with automatic AI analysis → admin validation).
 *
 * Idempotent: zones, Porteurs, rules and accounts are matched by name / e-mail and only created when
 * missing; Porteur fields are only filled when still null (manual edits in /admin/reseau are kept);
 * each demo campaign is created only when the advertiser has no campaign with that name. Campaigns
 * left by the pre-v2 seed (no map circle, so they can never be diffused) are replaced once.
 *
 * Usage: node scripts/seed-demo.mjs   (TPUB_API_URL defaults to http://localhost:8080)
 */
import { call, day, items, pngForm, SLOT_PRESETS } from "./lib/tpub-api.mjs";

const ADMIN = { email: "admin@tpub.local", password: "Admin@123" };
const ADVERTISER = {
  email: "demo@annonceur.tn",
  password: "Demo@1234",
  nom: "Amira Ben Salah",
  societe: "Maison Yasmine SARL",
  telephone: "+216 20 000 000",
  adresse: "La Marsa, Tunis",
};
const STAFF = [
  {
    email: "operateur@tpub.local",
    password: "Operateur@123",
    nom: "Karim Operateur",
    role: "OPERATEUR",
  },
  {
    email: "superviseur@tpub.local",
    password: "Superviseur@123",
    nom: "Nadia Superviseure",
    role: "SUPERVISEUR",
  },
];

const ZONES = [
  { name: "Tunis Centre", latitude: 36.8008, longitude: 10.18, radiusKm: 3 },
  { name: "Les Berges du Lac", latitude: 36.838, longitude: 10.24, radiusKm: 2.5 },
  { name: "La Marsa", latitude: 36.8782, longitude: 10.3247, radiusKm: 2 },
  { name: "Sousse Centre", latitude: 35.8256, longitude: 10.636, radiusKm: 3 },
  { name: "Sfax Centre", latitude: 34.7406, longitude: 10.7603, radiusKm: 3 },
];

/** `technicalStatus` and `visibilityScore` are only applied on creation / when still null. */
const SUPPORTS = [
  {
    zone: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    supportType: "ECRAN",
    latitude: 36.7998,
    longitude: 10.1817,
    diffusionCapacity: 6,
    visibilityScore: 90,
  },
  {
    zone: "Tunis Centre",
    name: "Totem Place Barcelone",
    supportType: "PANNEAU_NUMERIQUE",
    latitude: 36.7955,
    longitude: 10.1805,
    diffusionCapacity: 4,
    visibilityScore: 70,
  },
  {
    zone: "Les Berges du Lac",
    name: "Panneau numérique Lac 2",
    supportType: "PANNEAU_NUMERIQUE",
    latitude: 36.8455,
    longitude: 10.273,
    diffusionCapacity: 4,
    visibilityScore: 60,
  },
  {
    zone: "La Marsa",
    name: "Écran Corniche La Marsa",
    supportType: "ECRAN",
    latitude: 36.8829,
    longitude: 10.3301,
    diffusionCapacity: 6,
    visibilityScore: 75,
  },
  {
    zone: "Sousse Centre",
    name: "Écran Port El Kantaoui",
    supportType: "ECRAN",
    latitude: 35.892,
    longitude: 10.597,
    technicalStatus: "MAINTENANCE",
    visibilityScore: 65,
  },
  {
    zone: "Sfax Centre",
    name: "Écran Bab Bhar",
    supportType: "ECRAN",
    latitude: 34.7378,
    longitude: 10.7626,
    diffusionCapacity: 5,
    visibilityScore: 80,
  },
  {
    zone: "Tunis Centre",
    name: "Porteur relais Route de Bizerte",
    supportType: "POINT_WIFI",
    latitude: 36.8152,
    longitude: 10.1668,
    visibilityScore: 40,
  },
  {
    zone: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    supportType: "ECRAN",
    latitude: 34.7452,
    longitude: 10.7548,
    diffusionCapacity: 5,
    visibilityScore: 55,
  },
  {
    zone: "Sousse Centre",
    name: "Écran Boulevard Hédi Chaker",
    supportType: "ECRAN",
    latitude: 35.8288,
    longitude: 10.6405,
    diffusionCapacity: 4,
    technicalStatus: "HORS_LIGNE",
    visibilityScore: 70,
  },
  {
    zone: "Les Berges du Lac",
    name: "Point Wi-Fi Berges du Lac 1",
    supportType: "POINT_WIFI",
    latitude: 36.8322,
    longitude: 10.2338,
    diffusionCapacity: 2,
    technicalStatus: "INACTIF",
    visibilityScore: 30,
  },
];

/**
 * Porteur characteristics (docs/NETWORK-MAP-SPEC.md §8), keyed by support name. Only applied to fields
 * that are still null on the backend, so manual edits made in /admin/reseau are never overwritten.
 * headingDeg: direction the main screen face points (0 = north, clockwise).
 */
const PORTEURS = {
  "Écran LED Avenue Habib Bourguiba": {
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 90,
    address: "Place du 14 Janvier 2011, Avenue Habib Bourguiba, Tunis",
  },
  "Panneau numérique Lac 2": {
    porteurType: "B",
    mastHeightM: 30,
    headingDeg: 45,
    address: "Les Berges du Lac 2, Tunis",
  },
  "Écran Corniche La Marsa": {
    porteurType: "C",
    mastHeightM: 15,
    headingDeg: 240,
    address: "Corniche de La Marsa, La Marsa",
  },
  "Totem Place Barcelone": {
    porteurType: "C",
    mastHeightM: 15,
    headingDeg: 0,
    address: "Place Barcelone, Tunis",
  },
  "Écran Port El Kantaoui": {
    porteurType: "A",
    mastHeightM: 20,
    headingDeg: 135,
    address: "Port El Kantaoui, Hammam Sousse",
  },
  "Écran Bab Bhar": {
    porteurType: "B",
    mastHeightM: 25,
    headingDeg: 200,
    address: "Bab Bhar, Sfax",
  },
  "Porteur relais Route de Bizerte": {
    porteurType: "D",
    mastHeightM: 30,
    headingDeg: 315,
    address: "Route de Bizerte, Tunis",
  },
  "Rond-point Sfax El Jadida": {
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 0,
    address: "Sfax El Jadida, Sfax",
  },
  "Écran Boulevard Hédi Chaker": {
    porteurType: "B",
    mastHeightM: 20,
    headingDeg: 270,
    address: "Boulevard Hédi Chaker, Sousse",
  },
  "Point Wi-Fi Berges du Lac 1": {
    porteurType: "D",
    mastHeightM: 15,
    headingDeg: 180,
    address: "Les Berges du Lac 1, Tunis",
  },
};
const PORTEUR_FIELDS = ["porteurType", "mastHeightM", "headingDeg", "address", "visibilityScore"];

/** Added on top of the 8 rules seeded by V3 (matched by ruleName). */
const RULES = [
  {
    ruleName: "comparatif-denigrant",
    ruleType: "KEYWORD",
    pattern: "meilleur que, moins cher que, contrairement a nos concurrents",
    severity: "MEDIUM",
    sector: null,
    description: "Publicité comparative ou dénigrante envers la concurrence : à vérifier.",
  },
  {
    ruleName: "remise-excessive",
    ruleType: "REGEX",
    pattern: "-\\s?(8[0-9]|9[0-9])\\s?%",
    severity: "LOW",
    sector: "COMMERCE",
    description: "Remise annoncée de 80 % ou plus : risque de promesse trompeuse.",
  },
];

/**
 * Demo campaigns (names are the idempotency key). `circles` are map selections (point + radius);
 * `supports` are booked on the campaign window; `validate` asks the admin to validate after the AI.
 */
const CAMPAIGNS = [
  {
    name: "Ouverture boutique La Marsa",
    objective:
      "Informer les habitants de La Marsa et des Berges du Lac de l'ouverture de notre boutique de prêt-à-porter.",
    budget: 3500,
    startDate: day(0),
    endDate: day(30),
    ...SLOT_PRESETS.JOURNEE,
    media: "ouverture-boutique-la-marsa.png",
    circles: [
      { latitude: 36.8782, longitude: 10.3247, radiusKm: 2, label: "La Marsa" },
      { latitude: 36.8455, longitude: 10.273, radiusKm: 1, label: "Lac 2" },
    ],
    supports: ["Écran Corniche La Marsa", "Panneau numérique Lac 2"],
    submit: true,
    validate: true,
  },
  {
    name: "Soldes d'automne — Maison Yasmine",
    objective:
      "Faire connaître les soldes d'automne de la boutique aux passants du centre-ville de Tunis.",
    budget: 2400,
    startDate: day(10),
    endDate: day(24),
    ...SLOT_PRESETS.APRES_MIDI,
    media: "soldes-automne-maison-yasmine.png",
    circles: [{ latitude: 36.8008, longitude: 10.18, radiusKm: 1.5, label: "Avenue Bourguiba" }],
    supports: ["Écran LED Avenue Habib Bourguiba"],
    submit: true,
    validate: false,
  },
  {
    name: "Festival de Sfax — billetterie",
    objective:
      "Accès garanti pour les enfants lors de la soirée d'ouverture du festival, billetterie à Bab Bhar.",
    budget: 2000,
    startDate: day(15),
    endDate: day(25),
    ...SLOT_PRESETS.SOIR,
    media: "festival-sfax-billetterie.png",
    circles: [{ latitude: 34.7406, longitude: 10.7603, radiusKm: 2, label: "Sfax Centre" }],
    supports: ["Écran Bab Bhar"],
    submit: true,
    validate: false,
  },
  {
    name: "Rentrée scolaire — Librairie El Manar",
    objective: "Mettre en avant les fournitures de rentrée de la librairie.",
    budget: 1800,
    startDate: day(20),
    endDate: day(40),
    ...SLOT_PRESETS.MATIN,
    media: null,
    circles: [{ latitude: 36.8152, longitude: 10.1668, radiusKm: 2, label: "Route de Bizerte" }],
    supports: [],
    submit: false,
    validate: false,
  },
];

/** Names written by the pre-v2 seed; replaced when they have no map circle. */
const LEGACY_CAMPAIGNS = new Set([
  "Ouverture boutique La Marsa",
  "Soldes d'automne — Maison Yasmine",
  "Festival d'été — billetterie",
  "Rentrée scolaire — Librairie El Manar",
]);

async function seedNetwork(admin) {
  const zones = await call("GET", "/api/zones", { token: admin.token });
  for (const z of ZONES) {
    if (!zones.some((existing) => existing.name === z.name)) {
      zones.push(
        await call("POST", "/api/zones", { token: admin.token, body: { ...z, isActive: true } }),
      );
      console.log(`+ zone ${z.name}`);
    }
  }
  const zoneId = (name) => zones.find((z) => z.name === name).id;

  const supports = await call("GET", "/api/supports", { token: admin.token });
  for (const { zone, ...s } of SUPPORTS) {
    if (!supports.some((existing) => existing.name === s.name)) {
      supports.push(
        await call("POST", "/api/supports", {
          token: admin.token,
          body: { technicalStatus: "ACTIF", ...s, ...PORTEURS[s.name], zoneId: zoneId(zone) },
        }),
      );
      console.log(`+ Porteur ${s.name}`);
    }
  }

  // Porteur characteristics: fill only the fields that are still null (null = unchanged on PUT).
  for (const { name, visibilityScore } of SUPPORTS) {
    const index = supports.findIndex((s) => s.name === name);
    if (index === -1) continue;
    const wanted = { ...PORTEURS[name], visibilityScore };
    const current = supports[index];
    const missing = Object.fromEntries(
      PORTEUR_FIELDS.filter((f) => current[f] == null && wanted[f] != null).map((f) => [
        f,
        wanted[f],
      ]),
    );
    if (Object.keys(missing).length === 0) continue;
    supports[index] = await call("PUT", `/api/supports/${current.id}`, {
      token: admin.token,
      body: {
        zoneId: current.zoneId,
        name: current.name,
        supportType: current.supportType,
        latitude: current.latitude,
        longitude: current.longitude,
        ...missing,
      },
    });
    console.log(`~ Porteur ${name} : ${Object.keys(missing).join(", ")}`);
  }

  // One planned maintenance window (morning) on the Place Barcelone totem.
  const totem = supports.find((s) => s.name === "Totem Place Barcelone");
  if (totem) {
    const blocks = await call("GET", `/api/supports/${totem.id}/blocks`, {
      token: admin.token,
      query: { from: day(0), to: day(60) },
    });
    if (blocks.length === 0) {
      await call("POST", `/api/supports/${totem.id}/blocks`, {
        token: admin.token,
        body: {
          startDate: day(3),
          endDate: day(4),
          ...SLOT_PRESETS.MATIN,
          availabilityStatus: "MAINTENANCE",
          reason: "Nettoyage et contrôle de l'écran",
        },
      });
      console.log(`+ indisponibilité ${totem.name} (${day(3)} → ${day(4)}, matin)`);
    }
  }
  return supports;
}

async function seedRules(admin) {
  const rules = await call("GET", "/api/ai/rules", { token: admin.token });
  for (const rule of RULES) {
    if (rules.some((r) => r.ruleName === rule.ruleName)) continue;
    await call("POST", "/api/ai/rules", { token: admin.token, body: { ...rule, isActive: true } });
    console.log(`+ règle de modération ${rule.ruleName}`);
  }
  console.log(
    `Règles de modération : ${rules.length + RULES.filter((r) => !rules.some((x) => x.ruleName === r.ruleName)).length}`,
  );
}

async function seedAccounts(admin) {
  for (const staff of STAFF) {
    try {
      await call("POST", "/api/admin/users", { token: admin.token, body: staff });
      console.log(`+ compte ${staff.role} ${staff.email}`);
    } catch (err) {
      if (err.code !== "EMAIL_ALREADY_REGISTERED") throw err;
    }
  }

  let advertiser;
  try {
    advertiser = await call("POST", "/api/auth/register", { body: ADVERTISER });
    console.log(`+ compte annonceur ${ADVERTISER.email}`);
  } catch (err) {
    if (err.code !== "EMAIL_ALREADY_REGISTERED") throw err;
    advertiser = await call("POST", "/api/auth/login", {
      body: { email: ADVERTISER.email, password: ADVERTISER.password },
    });
  }

  // Manual validation of the advertiser (only from PENDING, so an admin decision is never undone).
  const me = await call("GET", "/api/me", { token: advertiser.token });
  if (me.client?.validationStatus === "PENDING") {
    await call("POST", `/api/admin/clients/${me.client.clientId}/validation`, {
      token: admin.token,
      body: {
        validationStatus: "VALIDATED",
        trustLevel: 80,
        notes: "Compte de démonstration vérifié.",
      },
    });
    console.log(`~ annonceur ${ADVERTISER.email} validé (confiance 80)`);
  }
  return advertiser;
}

/** Replaces campaigns of the pre-v2 seed: they have no map circle and can never be diffused. */
async function replaceLegacyCampaigns(admin, advertiser, mine) {
  const kept = [];
  for (const campaign of mine) {
    if (!LEGACY_CAMPAIGNS.has(campaign.name) || (campaign.zones?.length ?? 0) > 0) {
      kept.push(campaign);
      continue;
    }
    if (!campaign.deletable) {
      if (["PENDING_AI_CHECK", "TERMINATED"].includes(campaign.status)) {
        kept.push(campaign);
        continue;
      }
      await call("POST", `/api/admin/campaigns/${campaign.id}/reject`, {
        token: admin.token,
        body: { reason: "Remplacement des données de démonstration (version sans zone carte)." },
      });
    }
    await call("DELETE", `/api/campaigns/${campaign.id}`, { token: advertiser.token });
    console.log(`- ancienne campagne de démo « ${campaign.name} » remplacée`);
  }
  return kept;
}

async function seedCampaign(admin, advertiser, supports, spec) {
  const token = advertiser.token;
  const campaign = await call("POST", "/api/campaigns", {
    token,
    body: {
      name: spec.name,
      objective: spec.objective,
      budget: spec.budget,
      startDate: spec.startDate,
      endDate: spec.endDate,
      startTime: spec.startTime,
      endTime: spec.endTime,
    },
  });
  if (spec.media) {
    await call("POST", `/api/campaigns/${campaign.id}/media`, {
      token,
      form: pngForm(spec.media, campaign.id * 31 + spec.budget),
    });
  }
  await call("PUT", `/api/campaigns/${campaign.id}/zones`, {
    token,
    body: { zones: spec.circles },
  });
  const supportIds = spec.supports
    .map((name) => supports.find((s) => s.name === name)?.id)
    .filter(Boolean);
  if (supportIds.length > 0) {
    try {
      await call("POST", "/api/reservations/batch", {
        token,
        body: { campaignId: campaign.id, supportIds },
      });
    } catch (err) {
      console.log(`  ! réservation impossible pour « ${spec.name} » : ${err.message}`);
      return;
    }
  }
  if (!spec.submit) {
    console.log(`+ campagne « ${spec.name} » (brouillon)`);
    return;
  }
  const submitted = await call("POST", `/api/campaigns/${campaign.id}/submit`, { token });
  let status = submitted.status;
  if (spec.validate && ["APPROVED_BY_AI", "REVIEW_REQUIRED"].includes(status)) {
    const validated = await call("POST", `/api/admin/campaigns/${campaign.id}/validate`, {
      token: admin.token,
      body: {
        overrideAi: status === "REVIEW_REQUIRED",
        comment: "Campagne de démonstration validée.",
        priorityScore: 7,
      },
    });
    status = validated.status;
  }
  console.log(`+ campagne « ${spec.name} » (IA : ${submitted.aiStatus} → ${status})`);
}

async function main() {
  const health = await call("GET", "/actuator/health");
  console.log(`Backend : ${health.status}`);

  const admin = await call("POST", "/api/auth/login", { body: ADMIN });
  console.log(`Connecté en admin (${admin.email})`);

  const supports = await seedNetwork(admin);
  await seedRules(admin);
  const advertiser = await seedAccounts(admin);

  const mine = await replaceLegacyCampaigns(
    admin,
    advertiser,
    items(await call("GET", "/api/campaigns/mine", { token: advertiser.token })),
  );
  for (const spec of CAMPAIGNS) {
    if (mine.some((c) => c.name === spec.name)) continue;
    await seedCampaign(admin, advertiser, supports, spec);
  }
}

main().then(
  () => {
    console.log("\nDonnées de démo prêtes.");
    console.log(`  Admin       : ${ADMIN.email} / ${ADMIN.password}`);
    for (const s of STAFF) console.log(`  ${s.role.padEnd(11)} : ${s.email} / ${s.password}`);
    console.log(`  Annonceur   : ${ADVERTISER.email} / ${ADVERTISER.password}`);
  },
  (err) => {
    console.error(`Échec du seed : ${err.message}`);
    if (err.data?.errors) console.error(JSON.stringify(err.data.errors));
    process.exit(1);
  },
);
