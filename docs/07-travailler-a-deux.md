# 7. Travailler à deux : guide pas à pas

Ce guide est pour toi et ton binôme, **même sans rien connaître à Git**.
Tout se fait de deux façons, au choix :

- **double-clic** sur les fichiers numérotés du dossier `outils/` du projet ;
- **dans Claude Code** : tape une commande comme `/commencer` ou `/envoyer`.

Les deux font exactement la même chose (même moteur derrière). Chaque outil finit par **« Et maintenant ? »** : la prochaine étape.

## Les mots à connaître

| Mot | Ce que ça veut dire |
|---|---|
| **Dépôt** | Le projet sur GitHub, partagé par les deux. |
| **`dev`** | La version de travail commune. On n'y travaille **jamais** directement. |
| **`main`** | La version stable, mise à jour à chaque fin de sprint. |
| **Tâche** (branche) | Ta copie de travail pour une seule chose. Ex. : `feat/api-achat-territoire`. |
| **Enregistrer** (commit) | Prendre une photo de ton travail, avec une phrase qui dit ce qui change. |
| **Envoyer** (push) | Mettre tes enregistrements sur GitHub. C'est aussi ta sauvegarde. |
| **Proposition** (pull request, PR) | Demander que ta tâche rejoigne `dev`. |
| **Vérifications** (CI) | Les tests que GitHub lance tout seul sur chaque proposition. Vert = tout passe. |
| **Relecture** | Ton binôme regarde ta proposition et l'accepte. |
| **Fusionner** | Faire entrer la proposition dans `dev`. |

## Le principe

```mermaid
flowchart LR
  A["dev à jour"] --> B["Commencer une tâche"]
  B --> C["Travailler"]
  C --> D["Envoyer"]
  D --> C
  D --> E["Proposer"]
  E --> F["Vérifications vertes et relecture"]
  F --> G["Fusionner dans dev"]
  G --> A
```

## Les outils

| Double-clic (`outils/`) | Dans Claude Code | Ce que ça fait |
|---|---|---|
| `1-installer-mon-poste` | | Installe Git, Node.js et GitHub CLI, te connecte à GitHub, copie le projet. Relançable sans risque. |
| `2-mettre-a-jour` | `/mettre-a-jour` | Récupère le dernier `dev`. Sur une tâche, propose d'y intégrer les nouveautés. Range les tâches déjà fusionnées. |
| `3-commencer-une-tache` | `/commencer <sujet>` | Crée ta tâche à partir du dernier `dev`. Te demande : fonctionnalité ou correction, la zone, le sujet en clair. Peut aussi reprendre une tâche commencée. |
| `4-envoyer-mon-travail` | `/envoyer` | Enregistre tout ton travail et l'envoie sur GitHub. Te demande une phrase. |
| `5-proposer-mon-travail` | `/proposer` | Ouvre la proposition vers `dev`, remplie avec le modèle du projet. |
| `6-ou-j-en-suis` | `/ou-j-en-suis` | Montre où tu en es, les propositions ouvertes, les vérifications. Ne change rien. |
| `7-fusionner` | `/fusionner [n°]` | Fusionne une proposition dont les vérifications sont vertes. |
| `8-fin-de-sprint` | `/fin-de-sprint` | Fin de sprint : `dev` vers `main`, puis version `v0.<sprint>.0`. |
| | `/relire <n°>` | Claude t'explique la proposition de ton binôme avant que tu l'acceptes. |

## 1. Installer ton poste (une seule fois)

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas, et donne ton pseudo au propriétaire du dépôt.
2. Le propriétaire t'invite (voir [plus bas](#ajouter-le-binôme)). Tu reçois un e-mail : tu peux accepter tout de suite, ou laisser l'installateur le faire.
3. Ouvre le **Terminal** : clic droit sur le bouton Démarrer, puis « Terminal ».
4. Copie cette ligne, colle-la dans le Terminal (clic droit), puis appuie sur Entrée :

   ```powershell
   irm https://raw.githubusercontent.com/Ivar-lordbrock/france-tycoon/dev/outils/moteur/installer.ps1 | iex
   ```

5. Réponds aux questions :
   - Windows peut demander l'autorisation d'installer : clique sur **Oui** ;
   - pour GitHub : un code à 8 caractères s'affiche, une page s'ouvre, colle le code et clique sur « Authorize ».
6. À la fin, le projet est dans `C:\Users\<toi>\france-tycoon` et son dossier `outils` s'ouvre. Si tu as dit oui, un raccourci « France Tycoon - outils » est sur le Bureau.
7. Pour les commandes Claude : installe [Claude](https://claude.ai/download), va dans l'onglet **Code** et ouvre le dossier du projet.

Plus tard, `1-installer-mon-poste` sert à vérifier que tout va bien : ce qui est déjà en place est seulement vérifié.

## 2. La journée type

1. **`2-mettre-a-jour`** : tu récupères le travail de ton binôme.
2. **`3-commencer-une-tache`** : par exemple « achat de territoire », zone `api`. L'outil crée `feat/api-achat-territoire`.
3. **Tu travailles**, seul ou avec Claude.
4. **`4-envoyer-mon-travail`**, souvent (au moins à chaque pause) : c'est aussi ta sauvegarde.
5. La tâche est finie : **`5-proposer-mon-travail`**.
6. **`6-ou-j-en-suis`** : attends que les vérifications soient vertes (quelques minutes), puis que ton binôme accepte.
7. **`7-fusionner`**, puis on recommence en 1.

Une tâche = **une seule chose**, petite (quelques jours au plus). Plus c'est petit, moins il y a de conflits.

## 3. Relire le travail de ton binôme

- Sa proposition apparaît dans `6-ou-j-en-suis`, et GitHub t'envoie un e-mail.
- **Avec Claude** : `/relire 12` (le numéro de la proposition). Claude t'explique ce qui change, vérifie les règles du projet, et te demande avant d'accepter.
- **Sur GitHub** : ouvre la proposition, onglet « Files changed », bouton « Review changes », puis « Approve » (accepter) ou « Request changes » (demander des changements), et « Submit review ».
- Une fois acceptée et verte, **l'auteur** de la proposition la fusionne avec `7-fusionner`.

## 4. Tant que tu es seul

La règle « une relecture obligatoire » reste active sur `dev` et `main`.
Tant que ton binôme n'est pas là, `7-fusionner` te propose de **passer outre avec ton droit d'administrateur**, seulement si les vérifications sont vertes, et après t'avoir demandé confirmation.

Le jour où ton binôme arrive, il n'y a rien à changer : ses propositions et les tiennes passeront par la relecture. Lui n'est pas administrateur, il ne peut donc pas passer outre.

## 5. Fin de sprint (propriétaire)

Lance `8-fin-de-sprint` **deux fois** :

1. la première fois, il ouvre la proposition `dev` vers `main` avec la liste de ce qui a changé ;
2. quand les vérifications sont vertes, la seconde fois il fusionne dans `main` et crée la version `v0.<sprint>.0` (visible dans « Releases » sur GitHub).

## 6. Quand l'outil dit « Stop »

« Stop » veut dire qu'un garde-fou a refusé : **rien n'a été cassé**. Le message dit quoi faire.

| Message | Quoi faire |
|---|---|
| « Tu es sur dev : on n'y enregistre jamais directement » | Lance `3-commencer-une-tache` : tes modifications te suivent sur la nouvelle tâche. |
| « modifications pas encore envoyées » | Lance `4-envoyer-mon-travail`, puis recommence. |
| « Conflit » | Vous avez modifié les mêmes lignes. Tout a été remis comme avant. Dans Claude : « intègre dev dans ma tâche et règle les conflits ». |
| « Je n'envoie pas ces fichiers » | Un secret (`.env`), une base (`.sqlite`) ou un fichier de plus de 10 Mo. Sors-le du projet. |
| « GitHub refuse l'envoi » | Tu n'as pas encore accepté l'invitation : relance `1-installer-mon-poste`. |
| « vérifications ROUGES » | Un test échoue. Dans Claude : « pourquoi les vérifications de ma proposition sont rouges ? ». |
| « Node.js est introuvable » | Lance `1-installer-mon-poste`. |

**Règles d'or** : ne jamais travailler directement sur `dev` ou `main` (les outils refusent), envoyer souvent, une tâche = une chose. Si tu ne comprends pas un message, copie-le à Claude.

## 7. Pour le propriétaire du dépôt

### Ajouter le binôme

1. Sur GitHub : le dépôt, puis **Settings**, **Collaborators**, **Add people**, son pseudo, rôle **Write** (pas Admin).
2. Dans `.github/CODEOWNERS`, décommenter les lignes et remplacer les pseudos d'exemple par les vrais : GitHub demandera alors la relecture à la bonne personne (Claude peut le faire : « mets à jour CODEOWNERS avec le pseudo X »).
3. Lui envoyer le lien de ce guide.

### Sous le capot

- Le moteur est `outils/moteur/duo.mjs` (Node.js). `node outils/moteur/duo.mjs aide` liste les actions et leurs options pour l'utiliser sans clavier (c'est ce que font les commandes de `.claude/commands/`).
- Garde-fous : refus sur `main` et `dev`, arrêt s'il reste des modifications non enregistrées, jamais de `--force`, fusion seulement si les vérifications sont vertes, secrets et gros fichiers refusés, aucune fusion laissée à moitié en cas de conflit.
- Les fichiers `.bat` trouvent Node.js même s'il n'est pas dans le PATH (`C:\Program Files\nodejs`). Le moteur trouve Git et GitHub CLI de la même façon.
- Codes de sortie : 0 = fait, 1 = refusé par un garde-fou, 2 = il manque une réponse ou une option, 3 = erreur inattendue.
- Tests : `node --test outils/` (faux dépôts locaux). Ils tournent aussi sur Windows dans la CI « Outils du duo ».
