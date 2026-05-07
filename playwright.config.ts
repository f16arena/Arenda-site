import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? process.env.PORT ?? 3000)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const shouldStartWebServer = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/e2e-artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  timeout: 30_000,
  expect: {
    timeout: 7_000,
  },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldStartWebServer
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXTAUTH_URL: baseURL,
          ROOT_HOST: `127.0.0.1:${port}`,
          SENTRY_DSN: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
        },
      }
    : undefined,
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
})
