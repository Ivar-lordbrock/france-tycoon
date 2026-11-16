---
description: Récupérer le dernier dev depuis GitHub (et l'intégrer à la tâche en cours si besoin)
allowed-tools: Bash(node outils/moteur/duo.mjs:*)
---

Mets à jour la copie du projet avec l'outil du duo. La personne n'est pas forcément développeur : réponds en français simple et court.

1. Lance `node outils/moteur/duo.mjs mettre-a-jour`
   (si `node` est introuvable, utilise `"C:/Program Files/nodejs/node.exe"` à la place de `node`).
2. Si l'outil s'arrête avec le code 2 parce que dev a des nouveautés que la tâche n'a pas : résume ces nouveautés en une phrase et demande s'il faut les intégrer maintenant (c'est conseillé). Puis relance avec `--integrer` ou `--pas-integrer`.
3. En cas de conflit, l'outil remet tout comme avant. Propose de le régler : `git merge origin/dev`, résous chaque conflit en gardant le travail des deux côtés, lance les tests (`node --test backend/`, et `npm test` s'il existe), termine la fusion (`git commit --no-edit`), puis `/envoyer`. Explique ce que tu as choisi pour chaque conflit.
4. Résume le résultat en deux ou trois phrases, avec la prochaine étape que l'outil indique.

Ne contourne jamais un refus de l'outil (code 1) avec des commandes Git à la main sans l'accord de la personne : explique le refus et propose la suite.
