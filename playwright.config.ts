import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:4322',
    launchOptions: process.env.BROWSER_BIN
      ? { executablePath: process.env.BROWSER_BIN }
      : {},
  },
  webServer: {
    command: process.env.CI
      ? 'pnpm preview --port 4322'
      : 'pnpm build && pnpm preview --port 4322',
    url: 'http://localhost:4322',
    env: { PROJECT_META_FILE: 'tests/fixtures/project-meta.json' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
