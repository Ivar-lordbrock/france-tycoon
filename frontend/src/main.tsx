import '@fontsource-variable/archivo/wdth.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const client = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
});

const racine = document.getElementById('racine');
if (!racine) throw new Error('Élément #racine absent de index.html');

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
