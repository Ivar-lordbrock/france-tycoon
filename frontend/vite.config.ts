import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Le .env est à la racine du dépôt (partagé avec le serveur) ; seules les variables VITE_* arrivent au navigateur.
export default defineConfig({
  envDir: '..',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
