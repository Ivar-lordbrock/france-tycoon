---
description: Enregistrer et envoyer le travail sur GitHub (commit Conventional Commits + push)
argument-hint: [ce qui a été fait, en une phrase]
allowed-tools: Bash(node outils/moteur/duo.mjs:*), Bash(git status:*), Bash(git diff:*)
---

Enregistre et envoie le travail en cours avec l'outil du duo. Description donnée : « $ARGUMENTS »

1. Regarde ce qui a changé : `git status --short` et `git diff --stat` (et `git diff` si besoin de comprendre).
2. Si quelque chose ne devrait pas partir (fichier énorme, secret, fichier de test oublié, `.sqlite`, `.env`), arrête-toi et demande avant d'aller plus loin.
3. Écris une description d'une phrase, en français, au présent, de moins de 70 caractères, qui dit ce qui change (ex. : « ajout du bouton acheter sur la fiche commune »). Si une description est donnée ci-dessus, pars d'elle. L'outil ajoute tout seul le type et la zone (`feat(api): …`) d'après le nom de la branche.
4. Lance `node outils/moteur/duo.mjs envoyer --message "<description>"`
   (ajoute `--type fix|refactor|test|docs|chore` si ce n'est pas le type de la branche ; si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`).
5. Résume en une ou deux phrases : ce qui est parti, et la suite (continuer, ou `/proposer` si la tâche est finie).

Si l'outil refuse (code 1), explique pourquoi en mots simples et propose la suite qu'il indique. Ne fais jamais de `git push --force`.
