import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Essai de bout en bout (`npm run test:e2e`) : vrai navigateur, vrai serveur, base neuve rien que pour lui.
// Ports à part (API 3100, site 5199) pour ne pas gêner le jeu lancé avec `npm run dev`.
const API = 3100;
const SITE = 5199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${SITE}`,
    // Le Chrome déjà installé (PC, machines GitHub) : pas de navigateur à télécharger.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/preparer-base.ts && node backend/src/server.ts',
      url: `http://127.0.0.1:${API}/api/v1/admin/health`,
      // Ces variables passent avant celles du `.env` : jamais la vraie base, jamais Google.
      env: {
        PORT: String(API),
        DATABASE_PATH: join(tmpdir(), 'france-tycoon-e2e.sqlite'),
        AUTH_DEV: 'true',
        // Le compte de test « Chef » est admin du dashboard (e2e/admin.e2e.ts).
        ADMIN_EMAILS: 'chef@dev.invalid',
        GOOGLE_CLIENT_ID: '',
        APP_ORIGIN: `http://localhost:${SITE}`,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npm run dev -w frontend -- --port ${SITE}`,
      url: `http://localhost:${SITE}`,
      env: { API_PORT: String(API) },
    },
  ],
});
