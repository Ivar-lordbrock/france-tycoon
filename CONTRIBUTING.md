# Travailler à deux sur France Tycoon

## Branches

| Branche | Rôle | Règle |
|---|---|---|
| `main` | Version stable (ce qui est en ligne) | Protégée : pas de push direct, pas de force-push. On y arrive seulement par une PR `dev → main` en fin de sprint. |
| `dev` | Intégration (branche par défaut) | Protégée : on y arrive par PR, relue par l'autre développeur. |
| `feat/<zone>-<sujet>` | Une fonctionnalité | Part de `dev`, revient dans `dev` par PR. Ex. : `feat/api-achat-territoire`, `feat/map-selecteur-zones`. |
| `fix/<zone>-<sujet>` | Une correction | Idem. |

Zones : `api`, `db`, `data`, `map`, `ui`, `shared`, `docs`, `ci`.

## Cycle d'une tâche

Pas besoin de connaître Git : les outils du dossier [`outils/`](outils/) font chaque étape avec des garde-fous (double-clic, ou commande dans Claude Code). Guide pas à pas : [docs/07-travailler-a-deux.md](docs/07-travailler-a-deux.md).

| Étape | Double-clic (`outils/`) | Claude Code | Équivalent Git |
|---|---|---|---|
| Récupérer le dernier `dev` | `2-mettre-a-jour` | `/mettre-a-jour` | `git switch dev && git pull --ff-only` |
| Commencer une tâche | `3-commencer-une-tache` | `/commencer` | `git switch -c feat/api-achat-territoire origin/dev` |
| Enregistrer et envoyer | `4-envoyer-mon-travail` | `/envoyer` | `git add -A && git commit -m "feat(api): …" && git push -u origin HEAD` |
| Proposer (PR vers `dev`) | `5-proposer-mon-travail` | `/proposer` | `gh pr create --base dev` |
| Où j'en suis | `6-ou-j-en-suis` | `/ou-j-en-suis` | `git status`, `gh pr status` |
| Relire la PR de l'autre | GitHub, « Review changes » | `/relire <n°>` | `gh pr review <n°> --approve` |
| Fusionner (**squash**) | `7-fusionner` | `/fusionner` | `gh pr merge <n°> --squash` |
| Fin de sprint : `dev → main` (**merge commit**) et version `v0.<sprint>.0` | `8-fin-de-sprint` | `/fin-de-sprint` | `gh pr create --base main --head dev`, `gh pr merge --merge`, `gh release create v0.<sprint>.0` |

Garde-fous : refus de travailler sur `main` ou `dev`, arrêt s'il reste des modifications non enregistrées, jamais de `--force`, fusion seulement si les vérifications (CI) sont vertes, refus des secrets (`.env`), des bases (`.sqlite`) et des fichiers de plus de 10 Mo.

### Relecture tant qu'on est seul

La règle « 1 relecture obligatoire » reste active sur `main` et `dev`. Tant que le binôme n'est pas arrivé, le propriétaire fusionne ses propres PR avec son droit d'administrateur (`7-fusionner` le propose, après confirmation, et **seulement si la CI est verte**). Dès que le binôme est là, chaque PR est relue par l'autre.

## Convention de commits (Conventional Commits)

```
<type>(<zone>): <ce qui change, au présent>

feat(api): achat d'un territoire libre
fix(map): le sélecteur Outre-mer recentre bien sur Mayotte
feat(db): table takeovers et index des OPA en attente
docs(archi): formules de l'OPA
```

Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.
`!` après le type pour un changement cassant (ex. `feat(api)!: ...`).

## Répartition du duo

- **Dev A — Backend / Données** : `backend/`, `scripts/import/`, `backend/src/db/`.
- **Dev B — Frontend / Carte** : `frontend/`.
- **À deux** : `shared/` (types, schémas zod, formules d'équilibrage). Toute modification de `shared/` ou d'une route d'API se discute dans la PR, car elle touche les deux côtés.

Voir [docs/06-feuille-de-route.md](docs/06-feuille-de-route.md) pour le découpage par sprint.

## Règles du code

- Toute la logique de jeu (prix, revenus, OPA) est **calculée côté serveur**. Le front affiche des aperçus avec les mêmes formules (`shared/`), mais le serveur fait foi.
- L'argent est en **entiers** (jamais de nombres à virgule pour `cash` ou `premium_currency`).
- Chaque mouvement d'argent passe par le service portefeuille et laisse une ligne dans `wallet_transactions`.
- Les migrations SQL sont **en ajout seul** : on ne modifie jamais une migration déjà fusionnée, on en écrit une nouvelle.
- Pas de secret dans Git : copier `.env.example` en `.env`.
