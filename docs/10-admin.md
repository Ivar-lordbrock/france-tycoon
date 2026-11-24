# Dashboard /admin (configuration et test)

Le dashboard sert à gérer le jeu en ligne sans toucher la base à la main. Adresse : **kadastr.fr/admin**, avec la connexion Google du jeu. Les joueurs ne téléchargent jamais son code : la page est chargée à part.

Le serveur vérifie chaque demande. L'écran cache en plus les boutons interdits, mais c'est le serveur qui décide : une demande interdite reçoit une erreur **403** avec un message clair.

---

## 1. Les grades

| Grade | D'où il vient | Ce qu'il fait |
| --- | --- | --- |
| **Joueur** | tout le monde | rien dans `/admin` (page « Accès réservé ») |
| **Modérateur** | donné par un admin, écran Joueurs | regarde tout, prend des notes, suspend un joueur, classe les alertes, suit les signalements |
| **Admin** | donné par un admin, écran Joueurs | tout |
| **Admin d'office** | son e-mail est dans `ADMIN_EMAILS` (section 2) | tout, et personne ne peut le rétrograder depuis l'écran |

Deux règles s'appliquent partout :

- pas d'action sur **son propre compte** ;
- pas d'action sur un grade **égal ou plus haut** que le sien. Un modérateur ne suspend pas un autre modérateur. Un admin ne touche pas un autre admin ; seul un admin d'office le peut.

Chaque action sensible écrit une ligne dans le **journal d'audit** : qui, quand, quoi, sur qui, la valeur avant et après, et le motif. Ce journal ne s'efface jamais (vue « Anti-triche & logs », onglet « Audit de l'équipe »).

---

## 2. Configurer

### Sur le serveur

Les réglages sont dans `/srv/france-tycoon/app/.env`. L'installation les écrit (voir [09-mise-en-ligne.md](09-mise-en-ligne.md)).

| Réglage | Rôle |
| --- | --- |
| `ADMIN_EMAILS` | e-mails Google admin d'office, séparés par des virgules. Vide = aucun admin d'office. |
| `IP_SALT` | secret qui brouille (hache) les adresses IP des connexions. Vide = connexions non notées, et la règle « même adresse IP » ne voit rien. |

Pour changer `ADMIN_EMAILS`, relance l'installation. Elle se souvient des autres réponses :

```bash
sudo bash /srv/france-tycoon/app/deploiement/installer-serveur.sh
```

Ou modifie la ligne (`sudo nano /srv/france-tycoon/app/.env`), puis redémarre le jeu :

```bash
sudo systemctl restart france-tycoon
```

**`IP_SALT` : ne jamais l'afficher, ne jamais le changer.** L'installation le tire au hasard. Un nouveau sel change toutes les empreintes : la règle « même adresse IP » perd son historique. L'IP hachée est citée dans la page légale (`legal.html`).

### En local (développement)

Dans `.env`, avec `AUTH_DEV=true`, la connexion de développement donne l'e-mail `<pseudo en minuscules>@dev.invalid`. Exemple : `ADMIN_EMAILS=chef@dev.invalid`, puis connecte-toi avec le pseudo « Chef ».

### Sauvegardes du dashboard

- Le bouton « Sauvegarder maintenant » (admins) copie la base dans `/var/lib/france-tycoon/sauvegardes-admin/`, hors du site et hors de Git.
- Les 20 plus récentes sont gardées ; il faut 200 Mo libres sur le disque.
- **Remettre une sauvegarde** se fait sur le serveur, jamais depuis le web : [09-mise-en-ligne.md, section 9](09-mise-en-ligne.md#9-en-cas-de-gros-problème--remettre-la-sauvegarde). La copie chiffrée horaire sur Google Drive continue à côté.

### Santé du serveur

`GET /api/v1/admin/health` reste ouvert sans connexion (la veille s'en sert). Il donne la version du schéma de la base (`schemaVersion`) et l'état des tâches planifiées.

---

## 3. Qui peut faire quoi

✅ = permis. ❌ = bouton caché et refusé par le serveur (403).

| Vue | Action | Modérateur | Admin |
| --- | --- | --- | --- |
| Vue d'ensemble | chiffres, santé, graphiques sur 14 jours | ✅ | ✅ |
| Joueurs | chercher, ouvrir une fiche | ✅ | ✅ |
| | notes de l'équipe | ✅ | ✅ |
| | suspendre, lever une suspension | ✅ | ✅ |
| | bannir, débannir | ❌ | ✅ |
| | changer le grade | ❌ | ✅ |
| | reset partiel (communes, bâtiments, OPA) | ❌ | ✅ |
| | ajuster le solde (₮ ou gemmes) | ❌ | ✅ |
| Territoires & OPA | chercher une commune, une OPA | ✅ | ✅ |
| | forcer un prix, revenir au prix calculé | ❌ | ✅ |
| | forcer ou annuler une OPA | ❌ | ✅ |
| Anti-triche & logs | voir et classer les alertes | ✅ | ✅ |
| | lire les journaux (activité, audit, erreurs) | ✅ | ✅ |
| | exporter en CSV (avec les e-mails) | ❌ | ✅ |
| Live config & events | toute la vue (la vue est cachée) | ❌ | ✅ |
| Sauvegardes & signalements | voir la liste des sauvegardes | ✅ | ✅ |
| | lancer une sauvegarde | ❌ | ✅ |
| | suivre les signalements des joueurs | ✅ | ✅ |
| Contrôle live | maintenance, bannière, cadeaux | ❌ | ✅ |

Pendant une **maintenance**, les joueurs regardent sans agir. Toute l'équipe (modérateurs compris) continue à jouer pour tester.

Un joueur **suspendu** se connecte et regarde, voit le motif, mais n'agit plus. Un joueur **banni** ne se connecte plus.

---

## 4. Tester modérateur contre admin (pas à pas)

Il faut **deux comptes Google** : A (ton compte admin) et B (un autre compte, par exemple un compte de test).

1. **B devient joueur.** Dans une fenêtre privée, connecte B sur kadastr.fr. Va sur `kadastr.fr/admin` : la page dit « Accès réservé ».
2. **A donne le grade.** Avec A, ouvre `/admin` → **Joueurs** → cherche B → **Changer le grade** → Modérateur, avec un motif.
3. **B recharge `/admin`.** Vérifie :
   - le menu n'a pas « Live config & events » ;
   - sur la fiche d'un joueur, il y a « Suspendre » mais pas « Bannir », « Changer le grade », « Reset partiel » ni « Ajuster le solde » ;
   - B ne peut pas suspendre A (message « Grade égal ou supérieur au tien » ou « Admin d'office ») ;
   - dans « Anti-triche & logs », B classe une alerte, mais il n'y a pas de boutons d'export CSV ;
   - dans « Territoires & OPA », pas de prix forcé ni d'action sur les OPA.
4. **A relit l'audit.** Vue « Anti-triche & logs » → « Audit de l'équipe » : la ligne « Grade changé » pour B y est, avec ton motif.
5. **Fin du test.** A remet B en **Joueur** (« Changer le grade »). B recharge `/admin` : « Accès réservé ».

Le refus côté serveur est déjà testé à chaque proposition : les fichiers `backend/src/modules/admin/*.spec.ts` appellent chaque action interdite et attendent 403 (`npm test`). Le test Playwright `e2e/admin.e2e.ts` ouvre le dashboard dans un vrai navigateur.

---

## 5. Bon à savoir

- **Une alerte n'est pas une preuve.** Ouvre la fiche du joueur avant d'agir. Une alerte classée revient si un fait nouveau arrive (un compte de plus sur la même IP, une OPA de plus).
- **Comptes supprimés** : ils restent en base sous le nom « Joueur supprimé #n », sans e-mail. La liste des joueurs les cache.
- **Réglages à chaud** (vue « Live config & events ») : 3 multiplicateurs (prix d'achat, revenus, coût des bâtiments) et des événements datés qui s'arrêtent seuls. Détail des formules : [05-equilibrage.md](05-equilibrage.md).
- **Routes et tables** : [04-api.md](04-api.md) (routes `/api/v1/admin/*`) et [03-base-de-donnees.md](03-base-de-donnees.md) (migrations 010 à 015).
