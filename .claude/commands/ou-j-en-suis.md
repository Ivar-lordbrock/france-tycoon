---
description: Voir où on en est (branche, modifications, propositions ouvertes, vérifications) et la prochaine étape
allowed-tools: Bash(node outils/moteur/duo.mjs:*)
---

1. Lance `node outils/moteur/duo.mjs etat` (si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`). Cet outil ne modifie rien.
2. Résume en trois à cinq lignes simples : sur quelle tâche on est, ce qui n'est pas encore envoyé, l'état de la proposition (vérifications, relecture), et ce qui attend chez le binôme.
3. Termine par la prochaine étape conseillée par l'outil, sous forme de commande (`/envoyer`, `/proposer`, `/fusionner`…).

Si des vérifications sont rouges, propose de regarder pourquoi (`gh pr checks <numéro>`, puis `gh run view <id> --log-failed`).
