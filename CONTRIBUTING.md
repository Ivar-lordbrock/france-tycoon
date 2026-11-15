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

1. `git switch dev && git pull`
2. `git switch -c feat/api-achat-territoire`
3. Petits commits (voir convention ci-dessous).
4. `git push -u origin feat/api-achat-territoire` puis ouvrir une PR vers `dev`.
5. L'autre développeur relit. On fusionne en **squash** (un commit propre par fonctionnalité).
6. Fin de sprint : PR `dev → main` en **merge commit**, puis tag `v0.<sprint>.0`.

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
