import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// L'API écoute sur 3000 ; l'essai Playwright (playwright.config.ts) en lance une autre à côté.
const api = `http://127.0.0.1:${process.env.API_PORT ?? 3000}`;

// Le .env est à la racine du dépôt (partagé avec le serveur) ; seules les variables VITE_* arrivent au navigateur.
export default defineConfig({
  envDir: '..',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': api },
  },
  preview: {
    port: 4173,
    proxy: { '/api': api },
  },
});
