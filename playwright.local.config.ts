import { defineConfig, devices } from '@playwright/test';

// Runs the e2e suite against scripts/fanfare-local.py instead of `vite preview`, plus the
// phone-remote tests (tests/e2e-local) against a second instance started with --lan.
// Usage: npm run build && npm run test:e2e:local
const PORT = 4175;
const LAN_PORT = 4176;

export default defineConfig({
  projects: [
    { name: 'chromium-fanfare-local', testDir: 'tests/e2e', use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT}` } },
    { name: 'chromium-phone-remote', testDir: 'tests/e2e-local', use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LAN_PORT}` } },
  ],
  webServer: [
    { command: `python3 scripts/fanfare-local.py dist --port ${PORT}`, url: `http://127.0.0.1:${PORT}`, reuseExistingServer: false },
    { command: `python3 scripts/fanfare-local.py dist --lan --port ${LAN_PORT}`, url: `http://127.0.0.1:${LAN_PORT}`, reuseExistingServer: false },
  ],
});
