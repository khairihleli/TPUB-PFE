#!/usr/bin/env node
/**
 * Seeds a running TPUB backend with demo data (zones, screens/Porteurs, an advertiser account and
 * campaigns in several states). Idempotent: existing zones/screens are matched by name, Porteur
 * fields (porteurType, mastHeightM, headingDeg, address) are only set when still null, and
 * campaigns are only created when the demo advertiser has none.
 *
 * Usage: node scripts/seed-demo.mjs   (TPUB_API_URL defaults to http://localhost:8080)
 */

const API = (process.env.TPUB_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ADMIN = { email: "admin@tpub.local", password: "Admin@123" };
const ADVERTISER = {
  email: "demo@annonceur.tn",
  password: "Demo@1234",
  nom: "Amira Ben Salah",
  societe: "Maison Yasmine SARL",
  telephone: "+216 20 000 000",
  adresse: "La Marsa, Tunis",
};

const ZONES = [
  { name: "Tunis Centre", latitude: 36.8008, longitude: 10.18, radiusKm: 3 },
  { name: "Les Berges du Lac", latitude: 36.838, longitude: 10.24, radiusKm: 2.5 },
  { name: "La Marsa", latitude: 36.8782, longitude: 10.3247, radiusKm: 2 },
  { name: "Sousse Centre", latitude: 35.8256, longitude: 10.636, radiusKm: 3 },
  { name: "Sfax Centre", latitude: 34.7406, longitude: 10.7603, radiusKm: 3 },
];

const SUPPORTS = [
  {
    zone: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    supportType: "ECRAN",
    latitude: 36.7998,
    longitude: 10.1817,
    diffusionCapacity: 6,
  },
  {
    zone: "Tunis Centre",
    name: "Totem Place Barcelone",
    supportType: "PANNEAU_NUMERIQUE",
    latitude: 36.7955,
    longitude: 10.1805,
    diffusionCapacity: 4,
  },
  {
    zone: "Les Berges du Lac",
    name: "Panneau numérique Lac 2",
    supportType: "PANNEAU_NUMERIQUE",
    latitude: 36.8455,
    longitude: 10.273,
    diffusionCapacity: 4,
  },
  {
    zone: "La Marsa",
    name: "Écran Corniche La Marsa",
    supportType: "ECRAN",
    latitude: 36.8829,
    longitude: 10.3301,
    diffusionCapacity: 6,
  },
  {
    zone: "Sousse Centre",
    name: "Écran Port El Kantaoui",
    supportType: "ECRAN",
    latitude: 35.892,
    longitude: 10.597,
    technicalStatus: "MAINTENANCE",
  },
  {
    zone: "Sfax Centre",
    name: "Écran Bab Bhar",
    supportType: "ECRAN",
    latitude: 34.7378,
    longitude: 10.7626,
    diffusionCapacity: 5,
  },
  {
    zone: "Tunis Centre",
    name: "Porteur relais Route de Bizerte",
    supportType: "POINT_WIFI",
    latitude: 36.8152,
    longitude: 10.1668,
  },
  {
    zone: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    supportType: "ECRAN",
    latitude: 34.7452,
    longitude: 10.7548,
    diffusionCapacity: 5,
  },
];

/**
 * Porteur characteristics (docs/NETWORK-MAP-SPEC.md §8), keyed by support name. Only applied to fields that
 * are still null on the backend, so manual edits made in /admin/reseau are never overwritten.
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
};
const PORTEUR_FIELDS = ["porteurType", "mastHeightM", "headingDeg", "address"];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${data?.message ?? ""}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** YYYY-MM-DD, `days` from today. */
function day(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const health = await fetch(`${API}/actuator/health`).then((r) => r.json());
  console.log(`Backend ${API} : ${health.status}`);

  const admin = await call("POST", "/api/auth/login", { body: ADMIN });
  console.log(`Connecté en admin (${admin.email})`);

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
          body: { technicalStatus: "ACTIF", ...s, zoneId: zoneId(zone) },
        }),
      );
      console.log(`+ écran ${s.name}`);
    }
  }

  // Porteur characteristics: fill only the fields that are still null (null = unchanged on PUT).
  for (const [name, porteur] of Object.entries(PORTEURS)) {
    const index = supports.findIndex((s) => s.name === name);
    if (index === -1) continue;
    const current = supports[index];
    const missing = Object.fromEntries(
      PORTEUR_FIELDS.filter((field) => current[field] == null).map((field) => [
        field,
        porteur[field],
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
  const support = (name) => supports.find((s) => s.name === name);

  let advertiser;
  try {
    advertiser = await call("POST", "/api/auth/register", { body: ADVERTISER });
    console.log(`+ compte annonceur ${ADVERTISER.email}`);
  } catch (err) {
    if (err.status !== 400) throw err;
    advertiser = await call("POST", "/api/auth/login", {
      body: { email: ADVERTISER.email, password: ADVERTISER.password },
    });
  }

  const mine = await call("GET", "/api/campaigns/mine", { token: advertiser.token });
  if (mine.length > 0) {
    console.log(`L'annonceur a déjà ${mine.length} campagne(s) : campagnes non recréées.`);
    return;
  }

  const create = (body) => call("POST", "/api/campaigns", { token: advertiser.token, body });
  const reserve = (campaign, screenName) => {
    const s = support(screenName);
    return call("POST", "/api/reservations", {
      token: advertiser.token,
      body: {
        campaignId: campaign.id,
        zoneId: s.zoneId,
        supportId: s.id,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        startTime: campaign.startTime,
        endTime: campaign.endTime,
      },
    });
  };
  const submitAndCheck = async (campaign) => {
    await call("POST", `/api/campaigns/${campaign.id}/submit`, { token: advertiser.token });
    return call("POST", `/api/ai/check-content/${campaign.id}`, { token: advertiser.token });
  };

  // 1. Active campaign: reserved, AI-approved, validated by the admin.
  const active = await create({
    name: "Ouverture boutique La Marsa",
    objective:
      "Informer les habitants de La Marsa de l'ouverture de notre boutique de prêt-à-porter.",
    budget: 3500,
    startDate: day(1),
    endDate: day(30),
    startTime: "09:00:00",
    endTime: "21:00:00",
  });
  await reserve(active, "Écran Corniche La Marsa");
  await reserve(active, "Panneau numérique Lac 2");
  const activeReport = await submitAndCheck(active);
  if (activeReport.aiStatus.toLowerCase() === "approved") {
    await call("POST", `/api/admin/campaigns/${active.id}/validate`, { token: admin.token });
  }
  console.log(`+ campagne « ${active.name} » (IA : ${activeReport.aiStatus})`);

  // 2. Awaiting TPUB validation after a favourable AI analysis.
  const pending = await create({
    name: "Soldes d'automne — Maison Yasmine",
    objective: "Faire connaître les soldes d'automne de la boutique aux passants du centre-ville.",
    budget: 2400,
    startDate: day(10),
    endDate: day(24),
    startTime: "10:00:00",
    endTime: "20:00:00",
  });
  await reserve(pending, "Écran LED Avenue Habib Bourguiba");
  const pendingReport = await submitAndCheck(pending);
  console.log(`+ campagne « ${pending.name} » (IA : ${pendingReport.aiStatus})`);

  // 3. Manual review: the local AI fallback flags "gratuit".
  const review = await create({
    name: "Festival d'été — billetterie",
    objective: "Entrée gratuite pour les enfants lors de la soirée d'ouverture du festival.",
    budget: 2000,
    startDate: day(15),
    endDate: day(25),
    startTime: "17:00:00",
    endTime: "23:00:00",
  });
  await reserve(review, "Écran Bab Bhar");
  const reviewReport = await submitAndCheck(review);
  console.log(`+ campagne « ${review.name} » (IA : ${reviewReport.aiStatus})`);

  // 4. Draft, not yet reserved.
  const draft = await create({
    name: "Rentrée scolaire — Librairie El Manar",
    objective: "Mettre en avant les fournitures de rentrée de la librairie.",
    budget: 1800,
    startDate: day(20),
    endDate: day(40),
    startTime: "08:00:00",
    endTime: "19:00:00",
  });
  console.log(`+ campagne « ${draft.name} » (brouillon)`);
}

main().then(
  () => {
    console.log("\nDonnées de démo prêtes.");
    console.log(`  Admin      : ${ADMIN.email} / ${ADMIN.password}`);
    console.log(`  Annonceur  : ${ADVERTISER.email} / ${ADVERTISER.password}`);
  },
  (err) => {
    console.error(`Échec du seed : ${err.message}`);
    process.exit(1);
  },
);
