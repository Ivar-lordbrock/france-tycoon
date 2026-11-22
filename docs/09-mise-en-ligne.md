# Mettre le jeu en ligne (pas à pas)

Ce guide installe la bêta fermée sur un vrai serveur. Compte environ 2 heures, dont 40 minutes d'attente pendant l'import des données.

**Ce qu'on met en place :**

- un **serveur** loué chez OVHcloud (offre **VPS-1** : 2 cœurs, 4 Go de mémoire, en France) ;
- un **nom de domaine** en `.fr` (l'adresse du jeu, par exemple `france-tycoon.fr`) ;
- une **sauvegarde continue** de la base chez Backblaze B2 (dans l'Union européenne, gratuite jusqu'à 10 Go) ;
- la **mise à jour automatique** : chaque fusion dans `main` arrive sur le serveur en quelques minutes.

**Prix relevés le 22/11/2026 :** serveur 3,81 € HT par mois (4,57 € TTC) ; domaine 4,99 € HT la première année, puis 7,79 € HT par an ; sauvegarde 0 €.

**Avant de commencer :** le dossier `deploiement/` doit être dans la branche `main` (il y arrive à la prochaine fin d'étape, `/fin-d-etape`).

Les mots techniques sont expliqués dans le [lexique](#lexique) en bas de page.

---

## 1. Louer le serveur (OVHcloud)

1. Sur [ovhcloud.com](https://www.ovhcloud.com/fr/vps/), choisis l'offre **VPS-1**.
2. **Localisation** : une ville en **France** (Gravelines, Roubaix ou Strasbourg).
3. **Système** : **Ubuntu 24.04**. Pas besoin d'option payante : une copie de tout le serveur chaque jour est déjà comprise.
4. Paie, puis attends l'e-mail d'OVH. Il donne l'**adresse IP** du serveur (4 nombres, comme `51.83.12.34`) et l'accès au compte `ubuntu`.

## 2. Acheter le nom de domaine et le relier au serveur

1. Chez OVHcloud, rubrique **Noms de domaine**, achète ton `.fr`.
2. Dans l'espace client : **Noms de domaine** → ton domaine → onglet **Zone DNS**.
3. **Modifie** les entrées de type **A** (elles visent une page d'attente d'OVH) : la cible devient l'**adresse IP de ton serveur**. Fais-le pour la ligne sans sous-domaine et pour `www`.
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
   ssh ubuntu@51.83.12.34
   ```

   À la première connexion, il demande si tu fais confiance au serveur : tape `yes`. Puis le mot de passe d'OVH (rien ne s'affiche quand tu tapes, c'est normal). Le serveur peut demander de choisir un nouveau mot de passe.

2. Une fois connecté (la ligne commence par `ubuntu@`), tape :

   ```bash
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

## 8. Vérifier la sauvegarde

```bash
sudo bash /srv/france-tycoon/app/deploiement/verifier-sauvegarde.sh
```

Le script récupère la dernière copie depuis Backblaze, vérifie qu'elle n'est pas abîmée et la compare au jeu. Il doit finir par « La sauvegarde est bonne. ». Fais-le maintenant, puis une fois par mois.

Comment marche la sauvegarde : chaque modification de la base part chez Backblaze en quelques secondes, et une copie complète est faite chaque jour ; les copies de plus de 7 jours sont effacées. En plus, OVH garde chaque jour une copie de tout le serveur.

## 9. En cas de gros problème : remettre la sauvegarde

Si la base est abîmée ou si une erreur a tout cassé :

```bash
sudo bash /srv/france-tycoon/app/deploiement/restaurer-sauvegarde.sh
```

Il demande de taper `OUI`, arrête le jeu, range l'ancienne base de côté (rien n'est effacé), récupère la dernière sauvegarde et redémarre le jeu. Pour revenir à une heure précise (heure UTC, soit 1 heure de moins qu'en France l'hiver) :

```bash
sudo bash /srv/france-tycoon/app/deploiement/restaurer-sauvegarde.sh -timestamp 2026-12-01T18:00:00Z
```

Si tout le serveur est perdu : dans l'espace client OVH, **Sauvegarde automatisée** remet la copie de la veille.

## 10. Finir les pages légales

Dans `frontend/public/legal.html`, il reste des passages surlignés `<mark>` à remplir : l'éditeur (ton nom ou celui de l'association), l'adresse e-mail de contact, le directeur de la publication, le téléphone de l'hébergeur (celui des mentions légales d'OVHcloud) et le fond de carte. Remplis-les dans le dépôt comme un changement normal : à la fusion dans `main`, ils arrivent tout seuls sur le serveur.

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
