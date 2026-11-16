import { defineConfig } from 'vitest/config';

// Tests unitaires : fichiers *.spec.ts(x).
// Les *.test.mjs restent à node:test (`node --test backend/`, job CI « Schéma SQLite »).
export default defineConfig({
  test: {
    include: ['{shared,backend,frontend,scripts}/**/*.spec.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
