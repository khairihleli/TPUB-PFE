import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the production build (`npm run build` first). No backend: every browser call
 * to `/api/**` is mocked in e2e/fixtures/api.ts. TPUB_API_URL points at a closed port so
 * anything that slips through fails fast with the bridge's 502.
 */
const PORT = Number(process.env.E2E_PORT ?? 4310);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: isCI ? 2 : 4,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    reducedMotion: "reduce",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { TPUB_API_URL: "http://127.0.0.1:9", PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  },
});
