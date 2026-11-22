# 8. Brancher la connexion Google (pas à pas)

Pour que le bouton « Se connecter avec Google » marche, Google doit connaître le jeu. On lui crée une fiche, et Google donne en échange un **ID client** : une longue suite de caractères qui finit par `.apps.googleusercontent.com`. On colle cet ID dans le fichier `.env`, et c'est tout.

- L'ID client **n'est pas un secret** : le navigateur le voit de toute façon.
- Google affiche aussi un **code secret du client** : on n'en a **pas besoin**. Ne le colle nulle part et ne l'envoie à personne.
- Compte 15 minutes. C'est gratuit.

En attendant, le jeu marche déjà en local sans Google : avec `AUTH_DEV=true` dans `.env`, l'écran de connexion propose un **compte de test** (on tape juste un pseudo).

## 1. Créer le projet Google

1. Va sur <https://console.cloud.google.com> et connecte-toi avec ton compte Google.
2. En haut à gauche, clique sur la liste des projets (à côté du logo Google Cloud), puis **Nouveau projet**.
3. Nom du projet : `Kadastr`. Clique **Créer**.
4. Attends quelques secondes, puis choisis ce projet dans la liste en haut (son nom doit s'afficher).

## 2. Décrire le jeu (écran de consentement)

C'est ce que les joueurs verront quand Google leur demande « Autoriser Kadastr ? ».

1. Menu ☰ en haut à gauche → **API et services** → **Écran de consentement OAuth**. (La page peut s'appeler **Google Auth Platform** : c'est la même chose.)
2. Clique **Commencer**.
3. **Informations sur l'application** : nom `Kadastr`, adresse e-mail d'assistance = la tienne. **Suivant**.
4. **Audience** : choisis **Externe** (tous les comptes Google). **Suivant**.
5. **Coordonnées** : ton adresse e-mail. **Suivant**.
6. Coche l'accord avec le règlement de Google, puis **Créer**.

### Ajouter les testeurs

Au début, le jeu est en **mode Test** : seules les adresses de la liste peuvent se connecter.

1. Dans le menu de gauche, clique **Audience**.
2. Partie **Utilisateurs tests** → **Ajouter des utilisateurs** → tape ton adresse Gmail et celle de ton binôme → **Enregistrer**.

Plus tard, à la mise en ligne (étape 6), on cliquera **Publier l'application** sur cette même page pour ouvrir le jeu à tout le monde.

## 3. Créer l'ID client

1. Dans le menu de gauche, clique **Clients**, puis **Créer un client**.
2. **Type d'application** : **Application Web**.
3. **Nom** : `Kadastr local`.
4. **Origines JavaScript autorisées** : clique **Ajouter un URI** deux fois et tape exactement :
   - `http://localhost:5173`
   - `http://localhost`
5. **URI de redirection autorisés** : laisse vide.
6. Clique **Créer**.
7. Une fenêtre affiche l'**ID client**. Clique sur l'icône pour le copier. (Tu le retrouves plus tard dans **Clients**.)

## 4. Le coller dans le projet

1. À la racine du projet, ouvre le fichier `.env`. S'il n'existe pas, copie `.env.example` et renomme la copie en `.env`.
2. Trouve la ligne `GOOGLE_CLIENT_ID=` et colle l'ID juste après le `=`, sans espace ni guillemets :

   ```
   GOOGLE_CLIENT_ID=123456789012-abcdefg.apps.googleusercontent.com
   ```

3. Enregistre, puis arrête et relance le jeu (`npm run dev`).
4. Ouvre <http://localhost:5173> (bien `localhost`, pas `127.0.0.1`). Le bouton Google apparaît sur l'écran de connexion.

`.env` n'est jamais envoyé sur GitHub : chacun des deux développeurs fait l'étape 4 sur son PC (le même ID client sert aux deux).

## Si ça ne marche pas

| Ce que tu vois | Pourquoi | Quoi faire |
|---|---|---|
| Pas de bouton Google, seulement le compte de test | `GOOGLE_CLIENT_ID` vide, ou jeu pas relancé | Vérifie la ligne dans `.env`, relance `npm run dev` |
| « Erreur 400 : origin_mismatch » | L'adresse du site n'est pas dans la liste de Google | Ajoute `http://localhost:5173` et `http://localhost` (partie 3), ouvre bien `localhost` et pas `127.0.0.1` |
| « Accès bloqué : l'application n'a pas terminé la procédure de validation » | Ton adresse n'est pas dans les testeurs | Ajoute-la (partie 2, « Ajouter les testeurs ») |
| Ça ne marche toujours pas juste après un changement chez Google | Google met parfois quelques minutes à appliquer | Attends 5 à 10 minutes et réessaie |

## Pour la mise en ligne (étape 6)

- Ajoute l'adresse du vrai site (par exemple `https://france-tycoon.fr`) dans les **Origines JavaScript autorisées** du client.
- Mets le même `GOOGLE_CLIENT_ID` dans le `.env` du serveur.
- Sur le serveur, `AUTH_DEV` doit être absent ou `false` : le jeu refuse de démarrer en production avec le compte de test.
