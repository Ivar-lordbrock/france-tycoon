# 1. Skills et dépôt GitHub

## 1.1 Outils installés sur le poste (15/11/2026)

| Outil | Version | Commande |
|---|---|---|
| Node.js LTS | 26.13.1 (npm 11.20) | `winget install --id OpenJS.NodeJS.LTS -e` |
| GitHub CLI | 2.104.0 | `winget install --id GitHub.cli -e` puis `gh auth login --web` |
| Git | 2.55 | déjà présent |

## 1.2 Skills Claude Code (`vercel-labs/skills`)

Recherche faite avec `npx skills find <sujet>` sur : sqlite, leaflet, google oauth, fastify, react, git workflow, web design guidelines, frontend design, geojson, web game, oauth security, vitest, github actions.

Critères de choix : auteur reconnu ou nombre d'installations élevé, contenu **relu avant installation** (uniquement du texte Markdown, aucun script), utile pour notre stack.

Installation dans le projet (partagée avec le 2ᵉ développeur via Git, dans `.claude/skills/`), pour Claude Code, en copie :

```bash
npx skills add vercel-labs/agent-skills      --skill vercel-react-best-practices -a claude-code --copy -y
npx skills add vercel-labs/agent-skills      --skill web-design-guidelines       -a claude-code --copy -y
npx skills add anthropics/skills             --skill frontend-design             -a claude-code --copy -y
npx skills add mcollina/skills               --skill fastify-best-practices      -a claude-code --copy -y
npx skills add erayack/sqlite-best-practices --skill sqlite-best-practices       -a claude-code --copy -y
npx skills add agents-inc/skills             --skill web-maps-leaflet            -a claude-code --copy -y
npx skills add addyosmani/agent-skills       --skill git-workflow-and-versioning -a claude-code --copy -y
npx skills add antfu/skills                  --skill vitest                      -a claude-code --copy -y
```

| Skill | Source (installations) | Rôle dans le projet | Domaine demandé |
|---|---|---|---|
| `fastify-best-practices` | mcollina/skills (99 k) — Matteo Collina, mainteneur principal de Fastify | Routes, plugins, validation, erreurs, sécurité, déploiement de l'API | Architecture full-stack |
| `sqlite-best-practices` | erayack/sqlite-best-practices (245) — relu : règles WAL, index partiels, tables STRICT, FTS | Schéma et requêtes SQLite. **Déjà appliqué** : tables `STRICT`, index partiels | Base SQLite |
| `web-maps-leaflet` | agents-inc/skills (41) — relu : bonnes pratiques Leaflet 1.9, canvas, GeoJSON, nettoyage `map.remove()` | Carte interactive | Cartographie |
| `vercel-react-best-practices` | vercel-labs/agent-skills (902 k) | Performance React (rendus, chargement, bundle) | Architecture full-stack |
| `frontend-design` | anthropics/skills (1,1 M) | Direction visuelle forte, éviter l'interface « générique » | Design UI/UX |
| `web-design-guidelines` | vercel-labs/agent-skills (866 k) | Audit accessibilité/UX des écrans. ⚠️ Télécharge ses règles à jour depuis GitHub à chaque utilisation | Design UI/UX |
| `vitest` | antfu/skills (48 k) — Anthony Fu, équipe Vite/Vitest | Tests unitaires front et back | Qualité |
| `git-workflow-and-versioning` | addyosmani/agent-skills (72 k) — Addy Osmani | Commits atomiques, branches, PR, versions | Workflow Git/GitHub |

**Écartés** :
- *Google OAuth2* : aucun skill fiable trouvé (résultats génériques ou liés à d'autres produits comme Clerk ou Azure). Le flux est simple et documenté dans [02-stack-technique.md](02-stack-technique.md) et [04-api.md](04-api.md).
- *GeoJSON / SIG* : les skills trouvés visent PostGIS ou la conversion KML, hors de notre stack.
- *Jeux web* (`openai/skills@develop-web-game`…) : pensés pour des jeux en canvas testés image par image, pas pour un jeu de gestion sur carte.

Sur [skills.sh](https://skills.sh) et le dépôt `vercel-labs/skills` : pas de skill dédié aux systèmes d'information géographique ni aux jeux de gestion ; la combinaison ci-dessus couvre le besoin.

Restaurer les skills sur un autre poste (lit `skills-lock.json`) :

```bash
npx skills experimental_install
```

> Les skills tournent avec toutes les permissions de l'agent : en ajouter un nouveau = le relire d'abord.

Les skills déjà installés au niveau utilisateur sur ce poste (impeccable, emil-design-eng, taste-skill…) restent disponibles en plus, mais seuls ceux de `.claude/skills/` sont partagés avec le duo.

## 1.3 Dépôt GitHub

- **Dépôt public** : https://github.com/Ivar-lordbrock/france-tycoon
- **Branches** :
  - `main` = stable. **Protégée** : PR obligatoire avec 1 relecture, CI verte (« Schéma SQLite »), conversations résolues, pas de force-push ni de suppression.
  - `dev` = intégration, **branche par défaut** (les PR y vont toutes seules). **Protégée** : PR obligatoire avec 1 relecture, CI verte, pas de force-push ni de suppression.
  - Les administrateurs (le propriétaire) peuvent passer outre tant que le 2ᵉ développeur n'est pas là pour relire.
- **Fusion** : squash (fonctionnalité → `dev`) et merge commit (`dev → main`) ; branches supprimées après fusion.
- **CI** : `.github/workflows/ci.yml` lance `node --test backend/` à chaque push et PR sur `main` et `dev`.
- **Gabarits** : modèle de PR (`.github/pull_request_template.md`), `CODEOWNERS` (à compléter avec les pseudos).
- **Organisation** : jalons « Sprint 1 » à « Sprint 6 » ; étiquettes `backend`, `frontend`, `data`, `shared`, `design`.
- Règles de travail : [CONTRIBUTING.md](../CONTRIBUTING.md).

### Ajouter le 2ᵉ développeur

```bash
gh api -X PUT repos/Ivar-lordbrock/france-tycoon/collaborators/PSEUDO -f permission=push
```

Puis décommenter ses lignes dans `.github/CODEOWNERS`.
