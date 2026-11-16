---
description: Proposer le travail (pull request vers dev, remplie avec le modèle du projet)
allowed-tools: Bash(node outils/moteur/duo.mjs:*), Bash(git log:*), Bash(git diff:*)
---

Ouvre la proposition (pull request) de la tâche en cours vers `dev`, avec l'outil du duo.

1. Regarde le travail de la tâche : `git log --oneline origin/dev..HEAD` et `git diff --stat origin/dev...HEAD`.
2. Prépare :
   - un titre au format Conventional Commits, en français (ex. : `feat(api): achat d'un territoire libre`). Il deviendra le message de l'enregistrement dans dev ;
   - « quoi » : une ou deux phrases simples sur ce que fait ce travail ;
   - « pourquoi » : le sprint ou le besoin (voir `docs/06-feuille-de-route.md`), ou rien si ce n'est pas clair.
3. Lance `node outils/moteur/duo.mjs proposer --titre "<titre>" --quoi "<quoi>" --pourquoi "<pourquoi>"`
   (si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`).
4. Donne le lien de la proposition et explique la suite : les vérifications automatiques tournent quelques minutes, puis le binôme relit (`/ou-j-en-suis` pour suivre).

Si des cases du modèle concernent ce travail (tests, `shared/`, migrations, `docs/05-equilibrage.md`), signale celles qui semblent manquer.
