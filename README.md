# France Tycoon

Jeu web multijoueur de gestion et de conquête immobilière **sur la vraie carte de France** (Métropole et Outre-mer) : achète des communes, construis, encaisse des revenus même hors ligne, et rachète les territoires de tes rivaux par **OPA**.

> État : **conception terminée, code pas encore commencé** (Sprint 1 à venir). Le schéma de base de données est écrit et testé.

## Le jeu en bref

- Connexion **Google** uniquement ; 30 000 ₮ pour démarrer.
- **34 969 communes** réelles (API Geo de l'État), prix calculé avec la population et les équipements réels (INSEE, OpenStreetMap).
- **3 territoires** au départ, plus avec le Siège social et les rangs.
- **OPA** : rachète la commune d'un rival à 150 % de sa valeur ; il a 24 h pour se défendre.
- Joueurs inactifs 14 jours : leurs communes redeviennent libres.
- Tutoriel, 3 quêtes par jour, classement national.
- Deux monnaies dès la V1 (`cash` et gemmes) pour une boutique non pay-to-win en V2.

## Dossier d'architecture

| | |
|---|---|
| [1. Skills et dépôt GitHub](docs/01-skills-et-depot.md) | Outils installés, branches, protections |
| [2. Besoins et stack technique](docs/02-stack-technique.md) | React + Leaflet, Fastify, SQLite, import des communes, tâches planifiées |
| [3. Base de données](docs/03-base-de-donnees.md) | Schéma SQLite complet ([SQL](backend/src/db/migrations/001_initial.sql)) |
| [4. API REST](docs/04-api.md) | Toutes les routes et les flux |
| [5. Formules d'équilibrage](docs/05-equilibrage.md) | Prix, bâtiments, revenus, OPA |
| [6. Feuille de route](docs/06-feuille-de-route.md) | 6 sprints répartis entre deux développeurs |

## Structure

```
frontend/        React + Leaflet (Dev B)
backend/         Fastify + SQLite (Dev A) — migrations et tests du schéma déjà là
shared/          types, schémas d'API, formules (à deux)
scripts/import/  import des communes et des équipements
data/            données téléchargées (ignorées par Git)
docs/            dossier d'architecture
.claude/skills/  skills Claude Code partagés par le duo
```

## Démarrer

Prérequis : [Node.js](https://nodejs.org) LTS (≥ 22.18), Git.

```bash
git clone https://github.com/Ivar-lordbrock/france-tycoon.git
cd france-tycoon
git switch dev
npm install
npm run import:communes   # ~35 000 communes depuis l'API Geo (1re fois : long, ensuite cache dans data/raw/)
npm run dev               # API sur http://localhost:3000, carte sur http://localhost:5173
```

Le `.env` est facultatif en local (valeurs par défaut de `.env.example`). La base `data/france-tycoon.sqlite` est créée par l'import et n'est jamais commitée.

| Commande | Rôle |
|---|---|
| `npm test` | Vitest (front, back, shared, scripts) puis tests du schéma (`node --test backend/`) |
| `npm run lint` | Biome (lint + format) |
| `npm run typecheck` | TypeScript dans chaque espace |
| `npm run build` | Build du front (`frontend/dist`) |

## Travailler à deux

Branches `main` (stable, protégée) et `dev` (intégration, par défaut), une branche par fonctionnalité, PR relue par l'autre. Tout est dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Données et licences

Communes : API Geo / INSEE (Licence Ouverte 2.0). Équipements : INSEE BPE (Licence Ouverte 2.0) et © les contributeurs d'OpenStreetMap (ODbL). Fonds de carte : OpenStreetMap / IGN.
