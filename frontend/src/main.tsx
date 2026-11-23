import '@fontsource-variable/archivo/wdth.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { messageErreur } from './api/client.ts';
import { ajouterToast } from './etat/toasts.ts';
import { FeuilleDeRoute } from './FeuilleDeRoute.tsx';

const client = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
  // Une relecture en arrière-plan qui échoue (l'écran garde l'ancienne valeur) : on le dit en petit message.
  // Le premier chargement raté s'affiche à sa place, et une action refusée à côté de son bouton.
  queryCache: new QueryCache({
    onError: (erreur, query) => {
      if (query.state.data !== undefined) ajouterToast({ texte: messageErreur(erreur), ton: 'erreur' });
    },
  }),
});

const racine = document.getElementById('racine');
if (!racine) throw new Error('Élément #racine absent de index.html');

// shortcut: une seule autre page, choisie par l'adresse (Caddy et Vite servent index.html partout) ; passer à un routeur s'il en vient d'autres.
const Page = location.pathname.replace(/\/$/, '') === '/roadmap' ? FeuilleDeRoute : App;

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  </StrictMode>,
);
