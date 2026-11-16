# backend — Fastify + SQLite (Dev A)

Déjà là :
- `src/db/migrations/001_initial.sql` : schéma complet (19 tables STRICT)
- `src/db/migrations/002_seed.sql` : catalogues (bâtiments, tutoriel, quêtes, boutique)
- `src/db/schema.test.mjs` : 24 tests → `node --test backend/`

Créé à l'étape 1 : serveur Fastify, exécuteur de migrations, modules `auth/ map/ territories/ buildings/ takeovers/ quests/ tutorial/ leaderboard/ wallet/`, tâches planifiées dans `src/jobs/`.

Voir [docs/03-base-de-donnees.md](../docs/03-base-de-donnees.md) et [docs/04-api.md](../docs/04-api.md).
