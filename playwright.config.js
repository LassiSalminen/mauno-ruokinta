// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
    serviceWorkers: 'block', // PWA-testi sallii service workerin erikseen
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/serve.mjs 4173',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
