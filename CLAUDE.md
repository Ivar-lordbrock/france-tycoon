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

- Branche par fonctionnalité depuis `dev` (`feat/<zone>-<sujet>`), PR vers `dev`, jamais de push sur `main` ni sur `dev` (protégées).
- Conventional Commits : `feat(api): ...`, `fix(map): ...` (voir `CONTRIBUTING.md`).

## Outils du duo (`outils/`)

Les deux développeurs ne connaissent pas forcément Git. Pour le flux quotidien, passer par le moteur plutôt que par Git à la main : `node outils/moteur/duo.mjs <action> [options]` (`aide` liste tout ; si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`). Commandes : `/mettre-a-jour`, `/commencer`, `/envoyer`, `/proposer`, `/ou-j-en-suis`, `/fusionner`, `/fin-de-sprint`, `/relire` (`.claude/commands/`).

- Toujours passer les réponses en options (`--sujet`, `--message`, `--oui`…) : sans clavier, une question manquante s'arrête avec le code 2.
- Un « Stop » (code 1) est un garde-fou : expliquer le message à l'utilisateur, ne jamais le contourner à la main (pas de commit sur `dev`/`main`, pas de `--force`, pas de fusion si la CI n'est pas verte).
- `--sans-relecture` (droit admin) seulement après accord explicite de l'utilisateur.
- Fenêtre des outils pour l'utilisateur : `outils/0-ouvrir-les-outils.bat` (`duo.mjs interface`, page locale). Ne pas la lancer soi-même : elle ouvre une fenêtre sur l'écran de l'utilisateur.
- Modifier les outils : `node --test outils/` doit rester vert ; guide dans `docs/07-travailler-a-deux.md`.

## Commandes

- Tests du schéma : `node --test backend/`
- Tests des outils du duo : `node --test outils/`
- (Sprint 1) `npm install`, `npm run dev`, `npm test`, `npm run lint`

## Skills du projet (`.claude/skills/`)

fastify-best-practices, sqlite-best-practices, web-maps-leaflet, vercel-react-best-practices, frontend-design, web-design-guidelines, vitest, git-workflow-and-versioning. Les restaurer : `npx skills experimental_install` (lit `skills-lock.json`).
