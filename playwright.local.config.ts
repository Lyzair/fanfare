import { defineConfig, devices } from '@playwright/test';

// Runs the same e2e suite against scripts/fanfare-local.py instead of `vite preview`.
// Usage: npm run build && npm run test:e2e:local
const PORT = 4175;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: 'chromium-fanfare-local', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python3 scripts/fanfare-local.py dist --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
