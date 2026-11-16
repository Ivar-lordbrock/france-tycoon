---
description: Fusionner une proposition dont les vérifications sont vertes (dans dev, en un seul enregistrement)
argument-hint: [numéro de la proposition]
allowed-tools: Bash(node outils/moteur/duo.mjs fusionner:*)
---

Fusionne une proposition avec l'outil du duo. Numéro donné : « $ARGUMENTS » (vide = la proposition de la tâche en cours).

1. Lance `node outils/moteur/duo.mjs fusionner --oui`, avec `--pr <numéro>` si un numéro est donné
   (si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`). Taper `/fusionner` vaut accord pour fusionner une proposition relue et verte.
2. Si l'outil s'arrête parce que personne n'a relu (code 2, option `--sans-relecture`) : demande clairement, avec AskUserQuestion, « Personne n'a relu la proposition n°X. Fusionner quand même avec ton droit d'administrateur ? ». Relance avec `--sans-relecture` seulement après un oui explicite. Ne le décide jamais seul.
3. Si l'outil refuse (vérifications rouges ou en cours, conflit, brouillon, changements demandés), explique en mots simples et propose la suite. Ne fusionne jamais autrement qu'avec cet outil.
4. Résume : ce qui a été fusionné, et que le binôme le récupérera avec `/mettre-a-jour`.
