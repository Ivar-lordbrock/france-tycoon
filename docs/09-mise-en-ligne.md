# Mettre le jeu en ligne (pas à pas)

Ce guide installe la bêta fermée sur un vrai serveur. Compte environ 2 heures, dont 40 minutes d'attente pendant l'import des données.

**Ce qu'on met en place :**

- un **serveur** loué chez Contabo, dans l'Union européenne (Allemagne) : offre **Cloud VPS 4** (4 cœurs, 8 Go de mémoire), payée au mois, sans engagement. Les VPS d'OVH en France étaient épuisés le 22/11/2026 ; les scripts marchent chez tout hébergeur qui propose Ubuntu 24.04 ;
- un **nom de domaine** en `.fr` (l'adresse du jeu, par exemple `france-tycoon.fr`) ;
- une **sauvegarde continue** de la base chez Backblaze B2 (dans l'Union européenne, gratuite jusqu'à 10 Go) ;
- la **mise à jour automatique** : chaque fusion dans `main` arrive sur le serveur en quelques minutes.

**Prix relevés le 22/11/2026 :** serveur 5,50 € HT par mois (6,60 € TTC), plus 2,40 € TTC d'installation une seule fois ; domaine 4,99 € HT la première année, puis 7,79 € HT par an ; sauvegarde 0 €.

**Avant de commencer :** le dossier `deploiement/` doit être dans la branche `main` (il y arrive à la prochaine fin d'étape, `/fin-d-etape`).

Les mots techniques sont expliqués dans le [lexique](#lexique) en bas de page.

---

## 1. Louer le serveur (Contabo)

Le site de Contabo est en anglais : les mots à choisir sont écrits ci-dessous tels qu'ils apparaissent.

1. Sur [contabo.com](https://contabo.com/en/vps/), choisis **Cloud VPS 4** (4 cœurs, 8 Go de mémoire, 100 Go de disque) et clique sur **Get Started**.
2. **Term length** : **1 Month** (sans engagement : tu peux arrêter à la fin de n'importe quel mois).
3. **Region** : **European Union**.
4. **Storage** : laisse **100 GB SSD**. **Image** : **Ubuntu 24.04**.
5. Pas besoin d'option payante (ni « Auto Backup », ni panneau) : la base est déjà sauvegardée chez Backblaze (étape 3).
6. Quand on te le demande, choisis le **mot de passe du compte `root`** : long (au moins 16 caractères), gardé dans un gestionnaire de mots de passe.
7. Paie, puis attends l'e-mail de Contabo (de quelques minutes à quelques heures). Il donne l'**adresse IP** du serveur (4 nombres, comme `51.83.12.34`).

## 2. Acheter le nom de domaine et le relier au serveur

1. Chez OVHcloud, rubrique **Noms de domaine**, achète ton `.fr`.
2. Dans l'espace client : **Noms de domaine** → ton domaine → onglet **Zone DNS**.
3. **Modifie** les entrées de type **A** (elles visent une page d'attente d'OVH) : la cible devient l'**adresse IP de ton serveur**. Fais-le pour la ligne sans sous-domaine et pour `www` (le serveur renverra `www.ton-domaine.fr` vers `ton-domaine.fr`).
4. **Supprime** les entrées de type **AAAA** s'il y en a : sinon le cadenas HTTPS peut échouer.
5. Attends 10 à 30 minutes. Pour vérifier, dans PowerShell sur ton PC (remplace par ton domaine) :

   ```powershell
   Resolve-DnsName france-tycoon.fr -Type A
   ```

   La réponse doit montrer l'adresse IP de ton serveur.

## 3. Préparer la sauvegarde (Backblaze B2)

1. Crée un compte sur [backblaze.com](https://www.backblaze.com/cloud-storage) (offre **B2 Cloud Storage**). **Au moment de l'inscription, choisis la région « EU Central »** : elle ne se change plus après.
2. **Buckets** → **Create a Bucket** :
   - nom : unique au monde, par exemple `france-tycoon-sauvegarde-` suivi de chiffres au hasard ;
   - **Files in Bucket** : **Private** ;
   - **Default Encryption** : **Enable** ;
   - **Object Lock** : **Disable**.
3. Sur le bucket créé, **Lifecycle Settings** → **Keep only the last version of the file**. Sans ça, Backblaze garderait les vieilles copies pour toujours (les règles du jeu promettent 7 jours).
4. Note l'**Endpoint** affiché sur le bucket (par exemple `s3.eu-central-003.backblazeb2.com`).
5. **Application Keys** → **Add a New Application Key** :
   - nom : `france-tycoon-serveur` ;
   - **Allow access to Bucket(s)** : seulement ton bucket ;
   - **Type of Access** : **Read and Write**.
6. Note le **keyID** et l'**applicationKey**. L'applicationKey n'est montrée **qu'une seule fois** : garde-la dans un endroit sûr (gestionnaire de mots de passe), jamais dans le dépôt.

## 4. Préparer la connexion Google de production

Suis la partie « Pour la mise en ligne » de [08-connexion-google.md](08-connexion-google.md) : ajoute `https://` + ton domaine (par exemple `https://france-tycoon.fr`) dans les **Origines JavaScript autorisées** et note l'**ID client** (il finit par `.apps.googleusercontent.com`).

## 5. Installer le jeu sur le serveur

1. Sur ton PC, ouvre PowerShell et connecte-toi au serveur (remplace par l'adresse IP) :

   ```powershell
   ssh root@51.83.12.34
   ```

   À la première connexion, il demande si tu fais confiance au serveur : tape `yes`. Puis le mot de passe `root` choisi à la commande (rien ne s'affiche quand tu tapes, c'est normal).

2. Une fois connecté (la ligne commence par `root@`), tape :

   ```bash
   apt-get update && apt-get install -y git
   git clone --branch main https://github.com/Ivar-lordbrock/france-tycoon.git
   sudo bash france-tycoon/deploiement/installer-serveur.sh
   ```

3. Le script pose des questions : ton domaine, l'ID client Google, le lien « Donner mon avis » (formulaire ou `mailto:`), puis les 4 réglages de Backblaze (bucket, Endpoint, keyID, applicationKey). Si tu n'as pas encore une réponse, appuie sur **Entrée** : tu pourras relancer le script plus tard.

4. Le script installe tout (5 à 10 minutes) : pare-feu, mises à jour de sécurité automatiques (le serveur redémarre seul vers 4 h du matin si besoin), Node.js, Caddy, Litestream, puis construit et démarre le jeu.

5. À la fin, il affiche **deux choses à copier tout de suite** pour l'étape 7 :
   - `SERVEUR_EMPREINTE` : une ligne qui commence par `ssh-ed25519` ;
   - `SERVEUR_CLE_SSH` : un bloc de plusieurs lignes, de `-----BEGIN OPENSSH PRIVATE KEY-----` à `-----END OPENSSH PRIVATE KEY-----` compris. **Il n'est affiché qu'une fois.**

   Pour copier dans le terminal : sélectionne le texte à la souris, puis **Ctrl+Maj+C**.

6. Ouvre ton domaine dans le navigateur : la page du jeu apparaît, avec le cadenas. La carte est encore vide : c'est l'étape suivante.

## 6. Importer les communes et les équipements

Toujours connecté au serveur :

```bash
sudo bash /srv/france-tycoon/app/deploiement/importer-donnees.sh
```

L'import dure environ 40 minutes et continue même si tu fermes la fenêtre. Pour le suivre : `sudo journalctl -fu france-tycoon-import` (**Ctrl+C** pour arrêter de regarder, l'import continue). Il est fini quand `systemctl is-active france-tycoon-import` répond `inactive`.

Si Overpass (OpenStreetMap) est surchargé, l'import s'arrête : relance simplement la commande, rien n'est en double.

## 7. Brancher la mise à jour automatique (GitHub)

Sur la page du dépôt : **Settings** → **Secrets and variables** → **Actions**.

1. Onglet **Secrets** → **New repository secret**, deux fois :
   - `SERVEUR_CLE_SSH` : colle tout le bloc de la clé ;
   - `SERVEUR_EMPREINTE` : colle la ligne `ssh-ed25519 …`.
2. Onglet **Variables** → **New repository variable** :
   - `SERVEUR_HOTE` : l'adresse IP du serveur.
3. Essai : onglet **Actions** → **Déploiement** → **Run workflow**. Une coche verte = le serveur sait se mettre à jour.

Désormais, à chaque fusion dans `main`, la CI tourne, puis le déploiement : nouvelle version, construction du site et redémarrage du jeu (moins de 5 secondes de coupure).

La clé ne peut **que** lancer la mise à jour : même volée, elle ne donne pas accès au serveur. Si elle est perdue, refais-en une : sur le serveur, `sudo nano /srv/france-tycoon/.ssh/authorized_keys`, supprime la ligne `cle-deploiement-github`, relance `installer-serveur.sh` et remplace le secret.

**Alerte de panne** : le workflow **Veille du site** (`.github/workflows/veille.yml`) vérifie toutes les 15 minutes que la page et l'API répondent. En cas de panne, GitHub envoie un e-mail à la personne qui a modifié ce fichier en dernier (réglage GitHub : **Settings** de ton compte → **Notifications** → **Actions**, laisser les e-mails des échecs). Après 60 jours sans activité sur le dépôt, GitHub met le planning en pause : onglet **Actions** → **Veille du site** → **Enable workflow**.

## 8. Vérifier la sauvegarde

```bash
sudo bash /srv/france-tycoon/app/deploiement/verifier-sauvegarde.sh
```

Le script récupère la dernière copie depuis Backblaze, vérifie qu'elle n'est pas abîmée et la compare au jeu. Il doit finir par « La sauvegarde est bonne. ». Fais-le maintenant, puis une fois par mois.

Comment marche la sauvegarde : chaque modification de la base part chez Backblaze en quelques secondes, et une copie complète est faite chaque jour ; les copies de plus de 7 jours sont effacées. En plus, le panneau de Contabo permet de garder une copie de tout le serveur (**Snapshot**, une seule comprise) : fais-en une quand le jeu marche, et refais-la après un gros changement.

## 9. En cas de gros problème : remettre la sauvegarde

Si la base est abîmée ou si une erreur a tout cassé :

```bash
sudo bash /srv/france-tycoon/app/deploiement/restaurer-sauvegarde.sh
```

Il demande de taper `OUI`, arrête le jeu, range l'ancienne base de côté (rien n'est effacé), récupère la dernière sauvegarde et redémarre le jeu. Pour revenir à une heure précise (heure UTC, soit 1 heure de moins qu'en France l'hiver) :

```bash
sudo bash /srv/france-tycoon/app/deploiement/restaurer-sauvegarde.sh -timestamp 2026-12-01T18:00:00Z
```

Si tout le serveur est perdu : dans le panneau de Contabo, remets le dernier **Snapshot** (tout le serveur revient comme au jour de la copie).

## 10. Finir les pages légales

Fait le 22/11/2026 dans `frontend/public/legal.html` :

- éditeur : particulier **anonyme**. La loi (LCEN) le permet à qui publie sans but professionnel, si l'hébergeur connaît son identité. Le jour où le jeu vend quelque chose, il faut afficher le nom et l'adresse de l'éditeur (ou de la société) et le directeur de la publication ;
- contact : `contact@kadastr.fr`, une redirection OVH vers la boîte de l'éditeur (gestionnaire OVH → **Web Cloud** → **E-mails**) ;
- téléphone de Contabo : `+49 89 21268372`. Contabo n'en met pas dans ses mentions légales : ce numéro vient du registre RIPE, dont le fax est le même que celui de Contabo ;
- fond de carte : tuiles d'OpenStreetMap (`VITE_TILE_URL` vide). Si tu en changes, mets à jour la section « Sources ».

Pour changer un passage : modifie le fichier dans le dépôt comme un changement normal. À la fusion dans `main`, il arrive tout seul sur le serveur.

---

## Changer un réglage plus tard

Relance l'installation : elle se souvient des réponses (**Entrée** garde la réponse entre crochets) et ne casse rien.

```bash
sudo bash /srv/france-tycoon/app/deploiement/installer-serveur.sh
```

Pour changer le fond de carte (la politique d'OpenStreetMap interdit les sites à fort trafic, voir [02-stack-technique.md](02-stack-technique.md)) : modifie `VITE_TILE_URL` et `VITE_TILE_ATTRIBUTION` dans `/srv/france-tycoon/app/.env` (`sudo nano …`), puis lance une mise à jour (**Actions** → **Déploiement** → **Run workflow**).

## Commandes utiles sur le serveur

| Pour… | Taper |
|---|---|
| Savoir si le jeu tourne | `systemctl status france-tycoon` |
| Lire les messages du jeu en direct | `sudo journalctl -fu france-tycoon` |
| Redémarrer le jeu | `sudo systemctl restart france-tycoon` |
| Savoir si la sauvegarde tourne | `systemctl status france-tycoon-sauvegarde` |
| Mettre à jour à la main | `sudo -u france-tycoon -H bash /srv/france-tycoon/app/deploiement/deployer.sh` |
| Quitter le serveur | `exit` |

## Où sont les choses sur le serveur

| Quoi | Où |
|---|---|
| Code du jeu (copie de `main`) | `/srv/france-tycoon/app` |
| Base du jeu | `/var/lib/france-tycoon/france-tycoon.sqlite` |
| Réglages du jeu | `/srv/france-tycoon/app/.env` |
| Réponses données à l'installation | `/etc/france-tycoon/reglages.conf` |
| Réglages de la sauvegarde | `/etc/litestream.yml` |
| Réglages de Caddy | `/etc/caddy/Caddyfile` |

La mise à jour automatique ne touche pas `/etc/caddy/Caddyfile` : après un changement de `deploiement/Caddyfile`, le recopier à la main sur le serveur (même remplacement de `DOMAINE_DU_JEU`, garder le bloc `www.`), puis `caddy validate --config /etc/caddy/Caddyfile` et `systemctl reload caddy`.

Les messages du jeu (qui contiennent les adresses IP des joueurs) sont effacés au bout de 30 jours, comme annoncé dans les pages légales.

## Lexique

- **VPS** : un serveur loué, allumé jour et nuit dans un centre de données.
- **SSH** : la façon de taper des commandes sur le serveur depuis ton PC, de façon chiffrée.
- **Adresse IP** : le numéro du serveur sur Internet.
- **DNS, entrée A** : l'annuaire d'Internet ; l'entrée A dit « ce nom de domaine = cette adresse IP ».
- **HTTPS, cadenas** : la connexion chiffrée entre le navigateur et le jeu. **Caddy** l'obtient et la renouvelle tout seul (certificats gratuits Let's Encrypt).
- **Litestream** : le programme qui envoie chaque modification de la base vers la sauvegarde.
- **Bucket** : un espace de stockage chez Backblaze, comme un dossier en ligne.
- **Service (systemd)** : un programme que le serveur démarre tout seul, et redémarre s'il s'arrête.
- **Secret GitHub** : une valeur cachée que GitHub donne aux workflows sans jamais l'afficher.
- **Empreinte du serveur** : la carte d'identité du serveur ; GitHub vérifie qu'il parle bien au tien.
- **Pare-feu** : il bloque tout sauf SSH et le site (ports 80 et 443).
