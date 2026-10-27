import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4322',
    launchOptions: process.env.BROWSER_BIN
      ? { executablePath: process.env.BROWSER_BIN }
      : {},
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
