# 5. Formules d'équilibrage

Toutes les constantes ci-dessous vivent dans **un seul fichier**, `shared/src/balance.ts` (les formules de 5.1 depuis l'étape 1, le reste à l'étape 3), importé par le serveur (qui fait foi), par le front (aperçus) et par le script d'import (valeurs des communes). Les paramètres propres à chaque bâtiment sont dans la table `building_types` ([002_seed.sql](../backend/src/db/migrations/002_seed.sql)).

Notations : `P` population, `I` score d'infrastructures, `L` niveau, `arrondi_N` arrondi à N près, `plafond_N` arrondi au-dessus à N près, `⌊x⌋` partie entière.

## 5.1 Valeur d'une commune

### Score d'infrastructures

`I = Σ w_k × n_k`

`n_k` = nombre d'équipements de la catégorie k : BPE en priorité (Métropole, DROM), OpenStreetMap sinon (COM) ; gares, aéroports, ports, monuments et musées viennent toujours d'OSM.

| Catégorie | Poids w | | Catégorie | Poids w |
|---|---|---|---|---|
| commerce | 1 | | restaurant | 1 |
| service | 1 | | **gare** | **40** |
| santé | 2 | | **aéroport** | **150** |
| éducation | 2 | | **port** | **60** |
| sport et loisirs | 1 | | **monument** | **12** |
| hôtel | 2 | | **musée / attraction** | **8** |

### Valeur de base (prix d'achat d'une commune libre)

**`V0 = arrondi_100( 3 000 + 30 × P^0,9 + 1 200 × I^0,8 )`**

- Les exposants < 1 évitent que Paris coûte des milliards : la valeur grandit moins vite que la population.
- Le terme `I` donne leur prix aux petites communes touristiques (Le Mont-Saint-Michel, 23 habitants, vaut plus qu'un bourg de 800).

### Facteur de taille et emplacements

- **`f_T = borne( √(V0 / 10 000) ; 1 ; 60 )`** — multiplie le coût et le revenu des bâtiments : construire à Lyon coûte et rapporte plus qu'au village, avec le **même temps de retour**.
- **`Emplacements = borne( 2 + ⌊2 × log10(1 + P)⌋ ; 3 ; 16 )`** — une grande ville accueille plus de bâtiments.

> **Provisoire (étape 1)** : tant que BPE et OSM ne sont pas importés, `territory_stats` est vide, donc `I = 0` et V0 ne dépend que de la population. Le script `npm run import:communes` relit `territory_stats` à chaque passage : il suffira de le relancer après l'import des équipements.

### Exemples (valeurs réelles de population ; équipements estimés en attendant l'import BPE/OSM)

| Commune | Zone | Pop. | I | **V0** | f_T | Empl. | Revenu du sol /h | OPA sur le terrain nu |
|---|---|---|---|---|---|---|---|---|
| L'Abergement-Clémenciat (01) | MET | 859 | 7 | **21 800** | 1,5 | 7 | 218 | 32 700 |
| Saint-Véran (05) | MET | 160 | 57 | **36 400** | 1,9 | 6 | 364 | 54 600 |
| Le Mont-Saint-Michel (50) | MET | 23 | 221 | **93 600** | 3,1 | 4 | 936 | 140 400 |
| Pointe-à-Pitre (971) | GP | 15 040 | 1 702 | **636 700** | 8,0 | 10 | 6 367 | 955 100 |
| Papeete (987) | PF | 26 654 | 1 816 | **777 400** | 8,8 | 10 | 7 774 | 1 166 100 |
| Annecy (74) | MET | 132 117 | 4 870 | **2 291 500** | 15,1 | 12 | 22 915 | 3 437 300 |
| Lyon (69) | MET | 519 127 | 35 740 | **9 448 700** | 30,7 | 13 | 94 487 | 14 173 100 |
| Paris (75) | MET | 2 103 778 | 191 340 | **34 886 300** | 59,1 | 14 | 348 863 | 52 329 500 |

Capital de départ : **30 000 ₮** → un village dès le premier jour ; Paris est l'objectif de fin de partie.

## 5.2 Bâtiments

Pour un bâtiment de type b au niveau L, sur un territoire de facteur f_T :

- **Coût du niveau L** : `C(L) = arrondi_10( C_base × f_T × 1,4^(L−1) )`
- **Revenu au niveau L** : `R(L) = arrondi( R_base × f_T × L )` (linéaire : chaque niveau ajoute `R_base × f_T`)
- **Durée du chantier** : `T(L) = T_base × 1,5^(L−1)`
- **Temps de retour marginal** : `C(L) / (R_base × f_T) = TR₁ × 1,4^(L−1)` → environ 15 h au niveau 1, 58 h au niveau 5, 310 h (13 jours) au niveau 10. Remplir ses emplacements est plus rentable qu'empiler les niveaux, puis il faut viser une plus grande commune.

| Bâtiment | C_base | R_base /h | Empl. | Conditions | T_base | Effet |
|---|---|---|---|---|---|---|
| Résidence | 3 000 | 200 | 1 | — | 5 min | |
| Commerce de proximité | 5 500 | 350 | 1 | P ≥ 200 | 15 min | |
| Usine | 15 000 | 900 | 2 | P ≥ 1 000, max 2 | 45 min | |
| Quartier d'affaires | 40 000 | 2 400 | 2 | P ≥ 20 000, max 2 | 2 h | |
| Équipement public | 8 000 | 0 | 1 | max 1 | 30 min | **+8 % par niveau** sur tout le territoire |
| **Siège social** | 40 000 × **2,5**^(L−1) (pas de f_T) | 0 | 2 | 1 par joueur, niveau max 7 | 1 h × **2**^(L−1) | **+1 territoire max par niveau** ; sa commune devient la **capitale** (immunisée contre les OPA) |

Exemple, Résidence au village (f_T = 1,48) : niveau 1 = 4 430 ₮ pour 295 ₮/h, niveau 10 = 91 520 ₮ pour 2 953 ₮/h au total.
Siège social : 40 000 → 100 000 → 250 000 → 625 000 → 1,56 M → 3,9 M → 9,8 M.

Règles :
- Un chantier occupe une **file de construction** (1 au départ). Pendant une amélioration, le bâtiment continue de produire au niveau actuel.
- Premier chantier du tutoriel : 10 secondes.
- Démolition : rembourse 30 % de `invested_cash`.

## 5.3 Revenus passifs

- **Revenu du sol** : `R_sol = arrondi( 1 % × V0 )` par heure (temps de retour d'un terrain nu ≈ 100 h)
- **Revenu d'un territoire** : `R_T = ( R_sol + Σ R_b ) × ( 1 + Σ bonus_b / 100 )` — `bonus_b` = 8 × niveau de l'équipement public
- **Revenu du joueur** : `R_J = Σ R_T × ( 1 + boost )`, avec `boost ≤ 25 %` (boost de quête ou de boutique, jamais cumulés au-delà)

### Calcul hors ligne (différentiel temporel)

```
Δt   = min( maintenant − income_collected_at ; 24 h )
gain = ⌊ R_J × Δt / 3 600 ⌋
```

Le calcul se fait **par morceaux** : si un chantier s'est terminé pendant l'absence, on calcule jusqu'à sa date de fin avec l'ancien revenu, on applique le nouveau niveau, puis on continue. Le plafond de 24 h pousse à revenir chaque jour sans punir un week-end d'absence.

## 5.4 Valeur, patrimoine, limites

- **Valeur d'un territoire** : `V_T = V0 + B + F` — `B` = somme des `invested_cash` de ses bâtiments, `F` = fortifications (défenses d'OPA)
- **Patrimoine** (classement) : `NW = cash + Σ V_T + séquestres d'OPA en cours` (les gemmes ne comptent pas)
- **Achat** d'une commune libre : `V0`
- **Vente à l'État** : `arrondi_100_inférieur( 70 % × V_T )`
- **Limite de territoires** : `max_territories = min( 12 ; 3 + niveau du siège + bonus de rang + emplacement acheté )` ; une OPA sortante en cours compte comme un territoire réservé

| Rang | Patrimoine | Bonus |
|---|---|---|
| 0 Entrepreneur | 0 | — |
| 1 Notable | 250 000 | badge |
| 2 Baron | 2 500 000 | +1 territoire |
| 3 Magnat | 25 000 000 | +1 territoire, 2 OPA sortantes simultanées |
| 4 Tycoon | 250 000 000 | badge et skin exclusifs |

## 5.5 OPA (rachat hostile)

### Montants, figés au lancement

| | Formule | Village V_T = 30 000 | Annecy V_T = 3 000 000 |
|---|---|---|---|
| **Offre** (bloquée chez l'attaquant) | `P_OPA = plafond_100( 1,5 × V_T )` | 45 000 | 4 500 000 |
| **Coût de défense** | `D = plafond_100( 0,35 × V_T )` | 10 500 | 1 050 000 |
| **Indemnité d'échec** (attaquant → défenseur) | `i = plafond_100( 5 % × P_OPA )` | 2 300 | 225 000 |

### Les issues possibles

| Issue | Attaquant | Défenseur | Territoire |
|---|---|---|---|
| **Défendue** (le défenseur paie D dans les 24 h) | récupère `P_OPA − i` | paie `D`, reçoit `i` ; `F += D` (la défense augmente la valeur, donc la prochaine OPA coûtera plus cher) | reste au défenseur, **bouclier 72 h** |
| **Acceptée** (le défenseur vend tout de suite) | paie `P_OPA` | reçoit `P_OPA` | à l'attaquant avec ses bâtiments et chantiers, **bouclier 48 h** |
| **Expirée** sans réaction | paie `P_OPA` | reçoit `P_OPA` | idem |
| **Retirée** par l'attaquant | récupère `P_OPA − i` | reçoit `i` | rien ne change |
| *Annulée par le système* (défenseur libéré pour inactivité, compte banni) | récupère tout | — | — |

En patrimoine, une OPA réussie coûte `0,5 × V_T` à l'attaquant et rapporte `0,5 × V_T` au défenseur : on paie une **prime** pour prendre une place rare (la limite de territoires rend chaque commune précieuse). Pour l'attaquant, l'intérêt est le revenu et le prestige de la commune ; pour le défenseur, garder une commune bien construite coûte de la trésorerie.

### Conditions pour lancer une OPA (sinon code d'erreur, voir [04-api.md](04-api.md))

- Le territoire a un propriétaire, qui n'est pas l'attaquant, et ce n'est **pas sa capitale**.
- Pas de **bouclier** actif (72 h après une défense, 48 h après une OPA réussie, 12 h après un achat).
- Le défenseur n'est plus en **protection débutant** (72 h) ; l'attaquant a un compte de **7 jours** minimum (anti-multi-comptes) et perd sa propre protection débutant s'il attaque.
- **Anti-acharnement** : 1 OPA sortante à la fois (2 au rang Magnat) ; un défenseur ne peut pas subir plus de 2 OPA en même temps ; même attaquant → même défenseur : 7 jours d'attente après un échec ; impossible de viser un joueur dont le patrimoine est **inférieur à 25 %** du sien.
- L'attaquant a une place libre (territoires + OPA en cours < `max_territories`) et le cash pour `P_OPA`.

## 5.6 Inactivité

- Activité = toute requête connectée (`last_active_at` mis à jour au plus toutes les 5 min).
- J+11 sans activité : notification « tes territoires seront libérés dans 3 jours ».
- **J+14** : chaque territoire est racheté par l'État pour `arrondi_100_inférieur( 50 % × (V0 + B) )` (crédité au joueur, `inactivity_buyback`), ses bâtiments sont détruits, les OPA qui le visent sont annulées et remboursées, il redevient **libre au prix V0**. Le joueur passe `dormant` ; s'il revient, il garde son cash et repart.

## 5.7 Quêtes et tutoriel

- **Récompense d'une quête** : `max( cash_min ; arrondi_100( h × R_J ) )` — `h` = 1 à 4 heures de revenu selon la difficulté, figée au tirage. Elle reste utile du premier jour à la fin de partie.
- **Tirage** : chaque jour (heure de Paris), au premier appel, 1 quête facile + 1 moyenne + 1 difficile, tirées au hasard pondéré (`weight`) parmi celles dont le joueur remplit `min_territories`. Graine = `user_id + date` → même tirage si on recharge.
- **Tutoriel** : 10 étapes, 10 000 ₮ et 5 💎 au total, versés aux étapes 5, 7 et 10.

## 5.8 Gemmes (monnaie premium) : règles anti pay-to-win

- V1 : on gagne quelques gemmes (tutoriel, quêtes difficiles) ; la boutique est fermée.
- V2 : les gemmes achètent du **confort ou du style**, jamais de la victoire : skins de marqueurs, 2ᵉ file de construction (aussi achetable en cash), boost +10 % pendant 24 h (plafond global +25 %), 1 emplacement de territoire (aussi achetable en cash, une seule fois).
- **Interdit** : payer une OPA ou une défense en gemmes, acheter un bouclier, finir un chantier contre des gemmes au-delà d'un petit plafond.

## 5.9 Premier jour d'un joueur (contrôle de cohérence)

| Étape | Cash |
|---|---|
| Inscription | 30 000 |
| Achète L'Abergement-Clémenciat (V0 = 21 800) | 8 200 |
| Récompense tutoriel « premier achat » | 13 200 |
| Construit une Résidence (4 430) | 8 770 |
| Récompense « encaisser » | 10 770 |
| 2 Résidences de plus (8 860) | 1 910 |
| Revenu : 218 + 3 × 295 = **1 103 ₮/h** (≈ 26 500 ₮/jour) | |

Avec les 7 emplacements remplis : ≈ 2 280 ₮/h, soit une 2ᵉ commune de village en moins d'une journée et une ville comme Pointe-à-Pitre en une à deux semaines avec 3 territoires. À ajuster après la bêta (étape 6), en changeant seulement `shared/src/balance.ts` et `building_types`.
