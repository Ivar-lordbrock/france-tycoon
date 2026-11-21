# 6. Feuille de route : 6 étapes de 2 semaines

- **Dev A — Backend / Données** : API, base, import, tâches planifiées.
- **Dev B — Frontend / Carte** : React, Leaflet, écrans, tutoriel.
- **Règle « contrat d'abord »** : le 1er jour de chaque étape, les deux écrivent ensemble dans `shared/` les schémas zod des routes de l'étape. Dev B peut alors coder contre des **données factices** (MSW) sans attendre Dev A.
- **Fin d'étape** : démo de 15 min, PR `dev → main`, tag `v0.<n>.0`, mise à jour de cette page.
- Chaque étape a un jalon GitHub (« Étape 1 » … « Étape 6 ») : les issues s'y rangent.

## Étape 1 — Fondations et carte

| Dev A — Backend / Données | Dev B — Frontend / Carte |
|---|---|
| Monorepo npm workspaces (`frontend`, `backend`, `shared`), TypeScript, Biome, Vitest | App Vite + React + Tailwind, structure `map/ panels/ hud/` |
| Serveur Fastify, `/admin/health`, logs Pino, `.env` | Carte Leaflet (canvas), tuiles OSM + attribution |
| Connexion SQLite (WAL, pragmas) + exécuteur de migrations (`schema_migrations`) ; brancher `001` et `002` | Sélecteur des 12 zones + `maxBounds` par zone + masque gris hors France |
| `scripts/import/communes` : API Geo → `territories`, contours simplifiés, R*Tree, FTS | Couche départements (zoom < 9) depuis `public/geo/departements.json` |
| `GET /map/zones`, `GET /map/territories?bbox`, `GET /map/search` | Chargement des communes à l'écran (zoom ≥ 9), recherche avec autocomplétion |
| CI : lint + tests + build (étend `.github/workflows/ci.yml`) | |

**Fini quand** : on ouvre l'app, on saute en Martinique, on zoome, on voit les contours des communes et on trouve « Saint-Étienne » en tapant « saint etienne ».

## Étape 2 — Connexion Google et fiches de communes

| Dev A | Dev B |
|---|---|
| Projet Google Cloud (ID client OAuth, origines autorisées) | Bouton Google Identity Services, état connecté/déconnecté |
| `POST /auth/google`, sessions, `GET/PATCH /me`, `POST /auth/logout` ; création du profil + 30 000 ₮ via `wallet.apply` | Profil (avatar, pseudo, couleur de marqueur) |
| Service portefeuille `wallet.apply` + tests (soldes, idempotence) | Barre du haut : cash, gemmes, revenu/h |
| `scripts/import/bpe` et `osm` → `territory_stats` ; calcul de I, V0, emplacements (formules dans `shared/`) | Fiche commune : population, équipements, prix, revenu, propriétaire |
| `GET /territories/:insee` avec `actions possibles` | Couleur des communes selon l'état (libre, à moi, rival) |

**Fini quand** : un nouveau joueur se connecte avec Google, reçoit 30 000 ₮, ouvre la fiche de n'importe quelle commune avec un vrai prix.

## Étape 3 — Économie : achat, construction, revenus

Décisions prises le 17/11/2026 (détail dans [idees.md](idees.md#décisions-prises) et [05-equilibrage.md](05-equilibrage.md#52-bâtiments)) : bâtiments jusqu'au **niveau 5**, coût ×2 et revenu +70 % par niveau, chantiers **longs en temps réel** (durée ×2 par niveau, gare niveau 5 = 48 h), une **gare** en plus, **une seule file** de construction, chantier annulable et remboursé, siège social au niveau 5 et **4 territoires** au départ, revenus hors ligne plafonnés à **48 h**, bâtiments détruits à la revente.

**Faite** le 17/11/2026 en 7 paquets (PR #16 à #23), version **v0.3.0**. Reste pour plus tard : les erreurs s'affichent à côté de l'action (les toasts arrivent avec le direct, étape 4).

| Dev A | Dev B |
|---|---|
| `shared/src/balance.ts` (toutes les constantes de 05) + tests unitaires des formules | Bouton Acheter / Vendre avec confirmation et aperçu (formules `shared/`) |
| Migration 003 : nouveau catalogue de bâtiments (5 niveaux, durées, gare), 4 territoires au départ | Onglet « Bâtiments » de la fiche : emplacements, construire, améliorer, annuler, démolir, minuteurs |
| Achat, vente (bâtiments détruits), limite de territoires, bouclier 12 h | Cash qui monte en direct côté client, « encaisser » |
| Moteur de revenus différés **par morceaux** (chantiers finis pendant l'absence, plafond 48 h) + tests de temps simulé | Barre du haut : chantier en cours et temps restant (un clic ouvre la liste) |
| Bâtiments : construction, amélioration, annulation (remboursée), démolition, file unique, siège social, capitale | Liste « Mes territoires » ; résumé au retour (« pendant ton absence… ») |
| `GET /me/territories`, `/building-types`, `/me/construction-queue`, `/me/collect`, `/me/capital`, annulation d'un chantier, résumé des chantiers finis dans `/me` | Gestion des erreurs métier (toasts lisibles) |

**Fini quand** : on achète un village, on construit, on ferme l'onglet, on revient 2 h plus tard : le revenu encaissé est exact (testé automatiquement) et un résumé dit quels chantiers se sont terminés.

## Étape 4 — PvP : OPA et inactivité

Décisions prises le 17/11/2026 ([idees.md](idees.md#décisions-prises)) : les règles de [5.5](05-equilibrage.md#55-opa-rachat-hostile) et [5.6](05-equilibrage.md#56-inactivité) sont gardées telles quelles, dont l'ancienneté de **7 jours** pour lancer une OPA. Contrat dans `shared/src/api/opa.ts` et `notifications.ts`.

**Faite** le 17/11/2026 en 7 paquets (PR #25 à #31), version **v0.4.0**. Essayé à la main avec deux comptes : lancer, défendre, retirer, messages en direct. Vérifié seulement par les tests : accepter, 24 h sans réponse, inactivité.

| Dev A | Dev B |
|---|---|
| OPA : devis, lancement (séquestre), défense, acceptation, retrait, toutes les conditions de 5.5 | Fenêtre de devis d'OPA (montants, raisons d'inéligibilité) |
| Tâche `resolve-takeovers` + résolution à la lecture (même fonction, idempotente) + `job_runs` | Écran « OPA reçue » : compte à rebours, Défendre / Accepter |
| Tâches `release-inactive`, `warn-inactive` | États de carte : OPA en cours, bouclier |
| Notifications + flux SSE `/events` | Centre de notifications + toasts temps réel |
| Tests : chaque issue d'OPA, concurrence (deux OPA simultanées), inactivité | |

**Fini quand** : deux comptes de test jouent une OPA complète dans chacune des issues, et un compte inactif voit ses communes libérées.

## Étape 5 — Rétention : tutoriel, quêtes, classement

Décisions prises le 17/11/2026 ([idees.md](idees.md#décisions-prises)) : un **bouton « Encaisser »** dans la barre du haut (seul ce clic compte pour le tutoriel et la quête « Trésorier »), un **rang qui ne redescend jamais**, le tutoriel **proposé une fois aux joueurs déjà inscrits** (avec « Passer »). Contrat dans `shared/src/api/quetes.ts`, `tutoriel.ts` et `classement.ts`.

**Faite** le 21/11/2026 en 7 paquets (PR #33 à #39), version **v0.5.0**. Essayé à la main : le tutoriel du premier clic au classement (nouveau compte, ancien joueur, changement de compte), « Passer », quêtes, classement et profil. Vérifié seulement par les tests : le renouvellement des quêtes à minuit. Pas encore essayé sur téléphone.

| Dev A | Dev B |
|---|---|
| Bus d'événements interne (`territory_bought`, `building_started`...) qui fait avancer quêtes et tutoriel | Tutoriel interactif (bulle maison, driver.js écarté), 10 étapes, ancres `data-tuto` |
| Tirage des 3 quêtes du jour (graine user+date), réclamation | Panneau des quêtes avec progression |
| Tutoriel côté serveur (validation, récompenses, passer) ; `POST /events/track` | Classement national / Métropole / Outre-mer / région, profil public |
| Tâche `leaderboard` (patrimoine, rangs, bonus de territoire) | Accueil du premier lancement, écran de rang |

**Fini quand** : un nouveau joueur va du premier clic au classement guidé par le tutoriel, et ses quêtes se renouvellent à minuit (heure de Paris).

## Étape 6 — Solidité et mise en ligne (bêta fermée)

| Dev A | Dev B |
|---|---|
| Limitation de débit, contrôle `Origin`, revue de sécurité (`/security-review`) | Version mobile (carte plein écran, panneaux en bas) |
| Litestream + restauration testée ; VPS + Caddy (HTTPS) ; déploiement automatique depuis `main` | Performance carte (cache des bbox, contours `low/high`), accessibilité |
| Routes admin (relance de tâche, correction tracée) ; tables boutique derrière `FEATURE_SHOP` | Tests bout en bout Playwright (connexion simulée, achat, OPA) |
| Test de charge (k6) : 500 joueurs simultanés | Pages CGU, confidentialité (RGPD), mentions et attributions (OSM, INSEE, IGN) |
| Réglage de l'équilibrage avec les chiffres de la bêta | Retours des testeurs |

**Fini quand** : le jeu tourne en ligne en HTTPS pour 20 à 50 testeurs, avec sauvegarde continue vérifiée.

## Après la V1

- V2 monétisation : activer la boutique, Stripe Checkout + webhook → `payment_orders` et `gems_purchase`.
- E-mails (alerte d'OPA, inactivité), événements saisonniers, expéditions TAAF, alliances.

## Risques et parades

| Risque | Parade |
|---|---|
| Contours trop lourds, carte lente | Simplification à l'import, deux niveaux de détail, zoom ≥ 9 seulement, canvas |
| Limites de l'API Overpass | Pauses entre requêtes, cache `data/raw/`, ou extrait Geofabrik + osmium |
| Économie déséquilibrée | Toutes les constantes dans `shared/src/balance.ts` ; `balance_version` permet de recalculer les V0 |
| Multi-comptes qui se font des cadeaux par OPA | 7 jours d'ancienneté, règle des 25 %, alerte sur les paires récurrentes |
| Deux devs qui se marchent dessus | Zones de code séparées, contrat `shared/` en début d'étape, PR relue par l'autre |
