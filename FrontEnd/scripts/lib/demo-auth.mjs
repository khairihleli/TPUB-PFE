/**
 * Credentials and device keys of the demo scripts (docs/round2-contract.md §10). No password
 * literal lives in tracked files:
 * - administrator: TPUB_ADMIN_EMAIL (default admin@tpub.local) + TPUB_ADMIN_PASSWORD, else
 *   TPUB_ADMIN_INITIAL_PASSWORD (environment, then ../.tpub-local.secrets written by start-local.ps1);
 * - demo accounts: TPUB_DEMO_PASSWORD, else one password per account generated once into the
 *   gitignored scripts/.demo-accounts.json;
 * - player device keys: the gitignored scripts/.demo-device-keys.json ({ "<supportId>": "tpd_…" }).
 * A TOTP-protected administrator logs in with TPUB_ADMIN_TOTP_SECRET (Base32).
 */
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { call } from "./tpub-api.mjs";
import { totp } from "./totp.mjs";

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SECRETS_FILE = join(SCRIPTS_DIR, "..", "..", ".tpub-local.secrets");
export const DEMO_ACCOUNTS_FILE = join(SCRIPTS_DIR, ".demo-accounts.json");
export const DEVICE_KEYS_FILE = join(SCRIPTS_DIR, ".demo-device-keys.json");
export const DEVICE_KEY_HEADER = "X-TPUB-Device-Key";
export const FRONTEND_URL = (process.env.TPUB_FRONTEND_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** Error whose French message is printed as is, then the script exits with code 1. */
export class SetupError extends Error {}

/** `KEY=value` lines (comments and blank lines ignored); {} when the file does not exist. */
export function readKeyValueFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** Administrator e-mail and password, or a SetupError explaining where to set them. */
export function adminCredentials(env = process.env, secretsFile = SECRETS_FILE) {
  const email = env.TPUB_ADMIN_EMAIL?.trim() || "admin@tpub.local";
  const password =
    env.TPUB_ADMIN_PASSWORD ||
    env.TPUB_ADMIN_INITIAL_PASSWORD ||
    readKeyValueFile(secretsFile).TPUB_ADMIN_INITIAL_PASSWORD;
  if (!password) {
    throw new SetupError(
      "Mot de passe administrateur introuvable : définissez TPUB_ADMIN_PASSWORD (ou lancez start-local.ps1, qui écrit TPUB_ADMIN_INITIAL_PASSWORD dans .tpub-local.secrets).",
    );
  }
  return { email, password };
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 characters without ambiguous ones, at least one letter and one digit. */
export function generatePassword(length = 16) {
  for (;;) {
    let value = "";
    for (let i = 0; i < length; i++)
      value += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    if (/\d/.test(value) && /[A-Za-z]/.test(value)) return value;
  }
}

/**
 * Password of a demo account: TPUB_DEMO_PASSWORD, else the one stored in .demo-accounts.json,
 * generated and saved on first use when `create` is true (null otherwise).
 */
export function demoPassword(
  email,
  { create = true, env = process.env, file = DEMO_ACCOUNTS_FILE } = {},
) {
  if (env.TPUB_DEMO_PASSWORD) return env.TPUB_DEMO_PASSWORD;
  const accounts = readJson(file);
  if (typeof accounts[email] === "string" && accounts[email]) return accounts[email];
  if (!create) return null;
  accounts[email] = generatePassword();
  writeJson(file, accounts);
  return accounts[email];
}

/**
 * Logs in and completes the TOTP second step when needed. Refuses an account that must first
 * change its password (the scripts never do it on the person's behalf).
 */
export async function login({ email, password }, { env = process.env } = {}) {
  let auth;
  try {
    auth = await call("POST", "/api/auth/login", { body: { email, password } });
  } catch (err) {
    if (err.code === "BAD_CREDENTIALS") {
      throw new SetupError(
        `Connexion refusée pour ${email} : mot de passe incorrect. Une base existante garde son ancien mot de passe : relancez avec TPUB_ADMIN_PASSWORD=<mot de passe> (administrateur) ou TPUB_DEMO_PASSWORD=<mot de passe> (comptes de démonstration).`,
      );
    }
    throw err;
  }
  if (auth.status === "TOTP_ENROLMENT_REQUIRED") {
    throw new SetupError(
      `La double authentification est obligatoire pour ${email} : activez-la une première fois sur /connexion, puis relancez avec TPUB_ADMIN_TOTP_SECRET=<clé Base32>.`,
    );
  }
  if (auth.status === "TOTP_REQUIRED") {
    const secret = env.TPUB_ADMIN_TOTP_SECRET;
    if (!secret) {
      throw new SetupError(
        `Le compte ${email} est protégé par la double authentification : relancez avec TPUB_ADMIN_TOTP_SECRET=<clé Base32 affichée à l'activation>.`,
      );
    }
    auth = await call("POST", "/api/auth/login/verify", {
      body: { challengeToken: auth.challengeToken, code: totp(secret) },
    });
  }
  if (auth.mustChangePassword === true) {
    throw new SetupError(
      "Connectez-vous une première fois sur /connexion pour définir le mot de passe administrateur, puis relancez avec TPUB_ADMIN_PASSWORD",
    );
  }
  return auth;
}

/** Stored device keys by support id. */
export function readDeviceKeys(file = DEVICE_KEYS_FILE) {
  return readJson(file);
}

export function saveDeviceKey(supportId, key, file = DEVICE_KEYS_FILE) {
  const keys = readJson(file);
  keys[String(supportId)] = key;
  writeJson(file, keys);
}

export function pairingUrl(supportId, key) {
  return `${FRONTEND_URL}/ecran/${supportId}?cle=${key}`;
}

/** Device key of a Porteur: the stored one, else a new pairing done with the admin token. */
export async function deviceKeyFor(supportId, adminToken, file = DEVICE_KEYS_FILE) {
  const stored = readDeviceKeys(file)[String(supportId)];
  if (typeof stored === "string" && stored.startsWith("tpd_")) return stored;
  const issued = await call("POST", `/api/supports/${supportId}/device-key`, { token: adminToken });
  saveDeviceKey(supportId, issued.deviceKey, file);
  return issued.deviceKey;
}
