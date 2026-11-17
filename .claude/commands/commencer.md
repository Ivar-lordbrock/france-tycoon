---
description: Commencer une tâche (branche feat/<zone>-<sujet> ou fix/… depuis le dernier dev)
argument-hint: <sur quoi tu vas travailler, en clair>
allowed-tools: Bash(node outils/moteur/duo.mjs:*)
---

Commence une nouvelle tâche avec l'outil du duo. Sujet demandé : « $ARGUMENTS »

1. Si le sujet est vide, demande en une phrase sur quoi porte la tâche, ou s'il s'agit de reprendre une tâche existante (`git branch --list "feat/*" "fix/*"`).
2. Choisis :
   - le type : `feat` (nouvelle fonctionnalité) ou `fix` (correction d'un problème) ;
   - la zone : `api` (serveur), `db` (base de données), `data` (import des données), `map` (carte), `ui` (interface), `shared` (code commun), `docs` (documentation), `ci` (vérifications, outils). Appuie-toi sur `docs/06-feuille-de-route.md` et `CONTRIBUTING.md`. Si deux zones sont possibles, demande ;
   - un sujet court de 2 à 5 mots.
3. Lance `node outils/moteur/duo.mjs commencer --type <type> --zone <zone> --sujet "<sujet>"`
   (pour reprendre une tâche existante : `--reprendre <branche>` ; si `node` est introuvable : `"C:/Program Files/nodejs/node.exe"`).
4. Dis en une ou deux phrases sur quelle branche on est et la suite. Si l'outil refuse (code 1, par exemple des modifications pas encore envoyées), explique simplement et propose `/envoyer` d'abord.
