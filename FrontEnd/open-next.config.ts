import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Cloudflare Workers build (npm run cf:deploy). No incremental cache: the static pages are
// prerendered at build time and every other route is dynamic.
export default defineCloudflareConfig({});
