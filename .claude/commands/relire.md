---
description: Relire la proposition du binôme et l'expliquer simplement avant de l'accepter
argument-hint: <numéro de la proposition>
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr checks:*)
---

Aide à relire la proposition n°$ARGUMENTS (si aucun numéro : `gh pr list`, puis demande laquelle).

1. Lis-la : `gh pr view <n>`, `gh pr diff <n>`, `gh pr checks <n>` (si `gh` est introuvable : `"C:/Program Files/GitHub CLI/gh.exe"`).
2. Explique en mots simples, en cinq à dix lignes : ce que le travail change pour le jeu, les fichiers touchés, et ce qui mérite attention.
3. Vérifie les règles de `CLAUDE.md` et les cases du modèle de proposition : logique de jeu côté serveur, argent en entiers et `wallet_transactions`, migrations en ajout seul, `shared/` et `docs/04-api.md` à jour si l'API change, `docs/05-equilibrage.md` si l'économie change, tests présents, aucun secret.
4. Donne ton avis : « on peut accepter », « petites remarques » ou « à corriger », avec les raisons.
5. Demande ce qu'il faut faire, puis, seulement après un accord explicite :
   - accepter : `gh pr review <n> --approve --body "<remarques éventuelles>"` ;
   - demander des changements : `gh pr review <n> --request-changes --body "<liste claire>"` ;
   - commenter : `gh pr review <n> --comment --body "<remarques>"`.
   GitHub refuse qu'on accepte sa propre proposition : dans ce cas, propose seulement un commentaire.
