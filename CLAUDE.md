# France Tycoon — consignes pour Claude Code

Jeu web de gestion/conquête des communes françaises. Dossier d'architecture dans `docs/` : le lire avant de coder (surtout `03-base-de-donnees.md`, `04-api.md`, `05-equilibrage.md`).

## Langue

Tout en français : réponses, commentaires de code, messages de commit, docs.

## Règles qui ne se discutent pas

- La logique de jeu (prix, revenus, OPA) est calculée **côté serveur**. Le front n'affiche que des aperçus.
- Argent en **entiers**. Tout mouvement de `cash` / `premium_currency` passe par `wallet.apply` et écrit dans `wallet_transactions` (en ajout seul).
- Toute écriture en base dans une transaction (`db.transaction`, `BEGIN IMMEDIATE`).
- Constantes d'équilibrage uniquement dans `shared/src/balance.ts` et `building_types` ; mettre à jour `docs/05-equilibrage.md` en même temps.
- Migrations SQL en **ajout seul** : ne jamais modifier une migration déjà fusionnée.
- Seules les 12 zones françaises existent (`zone_code`) ; TAAF et Clipperton sont exclus en V1.
- Pas de secret ni de `.sqlite` dans Git.

## Git

- Branche par fonctionnalité depuis `dev` (`feat/<zone>-<sujet>`), PR vers `dev`, jamais de push sur `main`.
- Conventional Commits : `feat(api): ...`, `fix(map): ...` (voir `CONTRIBUTING.md`).

## Commandes

- Tests du schéma : `node --test backend/`
- (Sprint 1) `npm install`, `npm run dev`, `npm test`, `npm run lint`

## Skills du projet (`.claude/skills/`)

fastify-best-practices, sqlite-best-practices, web-maps-leaflet, vercel-react-best-practices, frontend-design, web-design-guidelines, vitest, git-workflow-and-versioning. Les restaurer : `npx skills experimental_install` (lit `skills-lock.json`).
