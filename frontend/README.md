# frontend — React + Leaflet (Dev B)

Vite + React + TypeScript + Tailwind, carte Leaflet en rendu canvas (react-leaflet), TanStack Query, Zustand.

```bash
npm run dev -w frontend      # http://localhost:5173 (le proxy envoie /api vers http://127.0.0.1:3000)
npm run build -w frontend    # frontend/dist
```

## Dossiers

| Dossier | Contenu |
|---|---|
| `src/map/` | Carte (`CarteFrance`), masque gris hors France, départements (zoom < 9), communes à l'écran (zoom ≥ 9), vues des zones et navigation |
| `src/panels/` | Sélecteur des 12 zones (+ raccourci Corse), recherche avec autocomplétion |
| `src/hud/` | Barre d'état (communes à l'écran, chargement, erreurs) |
| `src/api/` | Appels typés avec les schémas de `shared/` |
| `src/etat/` | Store Zustand (carte, vue, sélection) |
| `public/geo/` | Contours zones et départements, produits par `npm run import:communes` |

## Chargement des communes

À partir du zoom 9, la vue est découpée en cases fixes (1° aux zooms 9–10 avec les contours allégés, 0,5° dès le zoom 11 avec les contours précis). Chaque case est une requête `GET /api/v1/map/territories` mise en cache par TanStack Query : un petit déplacement ne recharge que les nouvelles cases. Les anciens contours restent affichés tant que les nouveaux ne sont pas tous arrivés.

Voir [docs/02-stack-technique.md](../docs/02-stack-technique.md) et [docs/04-api.md](../docs/04-api.md).
