# Idées à étudier

Les envies et les idées pour le jeu, notées au fil de l'eau. Elles ne sont **pas encore décidées** : on les regarde au début de l'étape concernée, puis on met à jour la doc ([05-equilibrage.md](05-equilibrage.md), [06-feuille-de-route.md](06-feuille-de-route.md)) si on les garde.

## Décisions prises

### Étape 3 — l'argent du jeu (17/11/2026)

L'idée « bâtiments à 5 niveaux, chantiers longs » (ci-dessous) est **adoptée**. Réponses données au début de l'étape 3 :

| Sujet | Décision |
|---|---|
| Niveaux | **5 au maximum** pour tous les bâtiments (au lieu de 10), siège social compris (au lieu de 7) |
| Bâtiments | Les 6 actuels + **la gare** (grand projet, dès 2 000 habitants, pas besoin d'une vraie gare) |
| Effet de la gare | **+10 % par niveau** sur tous les revenus de la commune (+50 % au niveau 5) |
| Prix et revenus | **Coût ×2** et **revenu +70 %** à chaque niveau (Résidence au village : 4 430 ₮ pour 295 ₮/h au niveau 1 → 70 870 ₮ pour 2 466 ₮/h au niveau 5) |
| Durée des chantiers | En temps réel, **×2 à chaque niveau** : Résidence 10 min → 2 h 40, gare 3 h → 48 h. Premier chantier du tutoriel : 10 s |
| Files de construction | **Une seule** (comme avant) ; une 2ᵉ s'achètera plus tard, avec la boutique |
| Annuler un chantier | Possible, **tout est remboursé** ; le bâtiment reste à son niveau |
| Territoires au départ | **4** (au lieu de 3), pour que le maximum de 12 reste atteignable avec un siège au niveau 5 |
| Revente à l'État | Les bâtiments sont **détruits** ; la commune redevient libre à son prix de base |
| Revenus hors ligne | Plafond de **48 h** (au lieu de 24 h) |
| Fin d'un chantier | **Minuteur + résumé au retour** à l'étape 3 ; message en direct à l'étape 4 |
| Où voir son chantier | **Barre du haut** (chantier en cours, temps restant, un clic ouvre la liste) + onglet « Bâtiments » de chaque fiche |

Déjà prévu par la doc, inchangé : pas d'accélération payante en V1, revenu qui monte tout seul à l'écran, démolition remboursée à 30 %, un bâtiment produit pendant son amélioration.

Restent des idées pour plus tard : port, aéroport et musée comme bâtiments ; notifications du navigateur quand un chantier finit ; bâtiments visibles sur la carte.

### Étape 4 — OPA et inactivité (17/11/2026)

Pas d'idée nouvelle dans ce fichier pour l'étape 4 : on garde les règles déjà écrites dans [05-equilibrage.md](05-equilibrage.md#55-opa-rachat-hostile) (5.5 et 5.6).

| Sujet | Décision |
|---|---|
| Ancienneté pour lancer une OPA | **7 jours**, comme prévu (3 jours proposés pour que les testeurs puissent attaquer plus tôt : refusé) |
| « Échec » qui bloque 7 jours le même attaquant contre le même défenseur | OPA **défendue ou retirée** (pas une OPA annulée par le système) |
| Rachat pour inactivité | 50 % de `V0 + B`, sans les fortifications |

### Étape 5 — tutoriel, quêtes, classement (17/11/2026)

Réponses données au début de l'étape 5 :

| Sujet | Décision |
|---|---|
| Encaisser | Un **bouton « Encaisser »** dans la barre du haut, avec le montant en attente. Les revenus continuent de s'encaisser tout seuls à chaque action, mais **seul ce clic** compte pour le tutoriel (étape 7) et la quête « Trésorier » |
| Rang | **Ne redescend jamais** : une fois Baron, on reste Baron même si le patrimoine baisse (sinon on perdrait un emplacement et on serait au-dessus de sa limite de territoires) |
| Joueurs déjà inscrits | Le tutoriel leur est **proposé une fois**, avec « Passer » ; récompenses versées seulement pour les étapes faites |

Choisi sans question, en suivant la doc : classement recalculé **toutes les 10 min** ; tous les joueurs actifs y figurent, même sans commune (à égalité, le plus ancien devant) ; classement d'une région ou de l'Outre-mer = les joueurs qui y possèdent au moins une commune, classés par patrimoine total ; quêtes tirées à la lecture (pas de tâche) ; une même commune ou zone ne compte qu'une fois par jour pour les quêtes « Repérage » et « Cap sur l'Outre-mer » ; badges de rang seulement (le skin Tycoon attend la boutique).

## Bâtiments : 5 niveaux, chantiers longs et de plus en plus chers

*Notée le 16/11/2026. **Adoptée le 17/11/2026** (voir « Décisions prises » ci-dessus).*

L'idée :
- Construire des bâtiments sur un territoire pour **augmenter ses revenus**.
- Chaque bâtiment a des **niveaux, jusqu'au niveau 5**.
- Chaque niveau **coûte plus cher que le précédent**.
- Le temps de construction se compte en **temps réel**, et il devient long. Par exemple, une **gare au niveau 5 demande 48 h**.

Ce que prévoyait la doc avant la décision :

| | Doc d'avant | Idée |
|---|---|---|
| Niveau maximum | jusqu'à 10 (sauf le Siège social : 7) | **5** |
| Coût | ×1,4 à chaque niveau | plus cher à chaque niveau (même principe) |
| Durée du chantier | courte : de 5 min à 2 h au niveau 1, ×1,5 à chaque niveau (une Résidence niveau 5 ≈ 25 min) | **longue** : jusqu'à 48 h au niveau 5 pour une gare |
| Gare | pas un bâtiment : seulement un équipement réel qui augmente le prix de la commune | un **bâtiment à construire** |
