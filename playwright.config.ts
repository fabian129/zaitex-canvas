import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1680, height: 1000 },
    screenshot: "only-on-failure",
    // Kör mot den förinstallerade Chromium-binären (ingen browser-nedladdning i sandboxen).
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
    // Sandboxens utgående HTTPS går via agent-proxyn; localhost ska inte proxas.
    // MITM-certet är inte i Chromiums store → ignorera certfel (endast testmiljön).
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" },
          ignoreHTTPSErrors: true,
        }
      : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
