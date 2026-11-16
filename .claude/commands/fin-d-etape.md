---
description: Fin d'étape (proposition dev → main, puis fusion et version v0.<étape>.0)
argument-hint: [numéro de l'étape]
allowed-tools: Bash(node outils/moteur/duo.mjs fin-d-etape:*)
---

Fin d'étape avec l'outil du duo. Étape donnée : « $ARGUMENTS ».

1. Lance d'abord `node outils/moteur/duo.mjs fin-d-etape --essai` (ajoute `--etape <n>` si un numéro est donné ; si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`) et montre ce qui va se passer.
2. Demande confirmation avec AskUserQuestion, puis relance sans `--essai` :
   - 1er passage : l'outil ouvre la proposition `dev → main`. Donne le lien et dis de relancer `/fin-d-etape` quand les vérifications sont vertes ;
   - 2e passage : l'outil fusionne dans `main` puis crée la version. Ajoute `--oui` après la confirmation ; s'il demande `--sans-relecture`, pose la question explicitement avant de l'ajouter.
3. Résume : version créée (lien) ou prochaine étape.
