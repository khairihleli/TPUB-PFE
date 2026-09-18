// Cloudflare Workers build/deploy (OpenNext). Usage: node scripts/cf.mjs build|deploy|preview
// SITE_URL is baked into the static pages; ZELQANE_TARGET switches off the Next image optimizer.
import { spawnSync } from "node:child_process";

const action = process.argv[2] ?? "build";
const env = {
  ...process.env,
  ZELQANE_TARGET: "cloudflare",
  SITE_URL: process.env.SITE_URL || "https://zelqane.com",
  ZELQANE_API_URL: process.env.ZELQANE_API_URL || "https://zelqane-backend.onrender.com",
};
const run = (args) => {
  const res = spawnSync("npx", ["opennextjs-cloudflare", ...args], { stdio: "inherit", env, shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

run(["build"]);
if (action === "deploy") run(["deploy"]);
if (action === "preview") run(["preview"]);
