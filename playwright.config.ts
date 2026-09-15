import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'https://staging.slapstat.com';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // No HTML report and no trace in CI. This repo is public, so any signed-in GitHub user can
  // download a run's artifacts, and Playwright titles a fill step with the value it typed
  // (`Fill "<value>"`), which puts the staging account's password in both. Run locally for them.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: process.env.CI ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
