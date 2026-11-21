# 5. Formules d'équilibrage

Toutes les constantes ci-dessous vivent dans **un seul fichier**, `shared/src/balance.ts` (5.1 depuis l'étape 1 ; capital de départ, protection débutant, revenu du sol et valeur d'un territoire depuis l'étape 2 ; bâtiments, revenus et limites à l'étape 3 ; OPA, patrimoine et inactivité à l'étape 4 ; rangs, quêtes et jour de Paris à l'étape 5), importé par le serveur (qui fait foi), par le front (aperçus) et par le script d'import (valeurs des communes). Les paramètres propres à chaque bâtiment sont dans la table `building_types` ([002_seed.sql](../backend/src/db/migrations/002_seed.sql), valeurs remplacées par [003_economie_etape3.sql](../backend/src/db/migrations/003_economie_etape3.sql)).

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

Les équipements viennent de `npm run import:bpe` (INSEE : domaines A services, B commerces, C éducation, D santé, F sports et loisirs, G tourisme ; A504 = restaurant ; hôtels, campings et auberges = hôtel ; domaine E transports ignoré) et de `npm run import:osm` (OpenStreetMap). Les deux recalculent I, V0 et les emplacements à la fin.

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

Capital de départ : **30 000 ₮** (`CAPITAL_DEPART`, protection débutant 72 h : `PROTECTION_DEBUTANT_S`) → un village dès le premier jour ; Paris est l'objectif de fin de partie.

## 5.2 Bâtiments

Décidé au début de l'étape 3 (17/11/2026, voir [idees.md](idees.md#décisions-prises)) : **tous les bâtiments s'arrêtent au niveau 5**, chaque niveau coûte plus cher que le précédent, et les chantiers durent longtemps, **en temps réel** (jusqu'à 48 h pour une gare niveau 5).

Pour un bâtiment de type b au niveau L (1 à 5), sur un territoire de facteur f_T :

- **Coût du niveau L** : `C(L) = arrondi_10( C_base × f_T × 2^(L−1) )` (le coût double à chaque niveau)
- **Revenu au niveau L** : `R(L) = arrondi( R_base × f_T × 1,7^(L−1) )` (chaque niveau rapporte 70 % de plus que le précédent)
- **Durée du chantier** : `T(L) = T_base × 2^(L−1)` (chaque niveau prend deux fois plus de temps)
- **Temps de retour marginal** : `C(L) / (R(L) − R(L−1))` → pour une Résidence, environ 15 h au niveau 1, 43 h au niveau 2, 50 h au niveau 3, 59 h au niveau 4 et 70 h au niveau 5. Remplir ses emplacements reste plus rentable que monter les niveaux, puis il faut viser une plus grande commune.

| Bâtiment | C_base | R_base /h | Empl. | Conditions | T_base (niveau 1 → 5) | Effet |
|---|---|---|---|---|---|---|
| Résidence | 3 000 | 200 | 1 | — | 10 min → 2 h 40 | |
| Commerce de proximité | 5 500 | 350 | 1 | P ≥ 200 | 20 min → 5 h 20 | |
| Usine | 15 000 | 900 | 2 | P ≥ 1 000, max 2 | 1 h → 16 h | |
| Quartier d'affaires | 40 000 | 2 400 | 2 | P ≥ 20 000, max 2 | 2 h → 32 h | |
| Équipement public | 8 000 | 0 | 1 | max 1 | 30 min → 8 h | **+8 % par niveau** sur tout le territoire (+40 % au niveau 5) |
| **Gare** | 20 000 | 0 | 2 | P ≥ 2 000, max 1 | 3 h → 48 h | **+10 % par niveau** sur tout le territoire (+50 % au niveau 5) |
| **Siège social** | 40 000 × **2,5**^(L−1) (pas de f_T) | 0 | 2 | 1 par joueur | 1 h → 16 h | **+1 territoire max par niveau** ; sa commune devient la **capitale** (immunisée contre les OPA) |

- La gare ne demande pas de vraie gare dans la commune : seulement 2 000 habitants (l'Outre-mer n'a presque pas de trains). Elle est surtout intéressante dans les grandes villes, qui ont beaucoup d'emplacements à faire profiter du bonus.
- Exemple, Résidence au village (f_T = 1,48) :

| Niveau | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Coût | 4 430 | 8 860 | 17 720 | 35 440 | 70 870 |
| Revenu /h | 295 | 502 | 853 | 1 451 | 2 466 |
| Chantier | 10 min | 20 min | 40 min | 1 h 20 | 2 h 40 |

- Siège social : 40 000 → 100 000 → 250 000 → 625 000 → 1,56 M.
- Les valeurs de [002_seed.sql](../backend/src/db/migrations/002_seed.sql) (10 niveaux, ×1,4, durées ×1,5, pas de gare) sont remplacées par [003_economie_etape3.sql](../backend/src/db/migrations/003_economie_etape3.sql) (les migrations sont en ajout seul). Attention : dans la nouvelle formule, `income_growth` (1,7) n'est plus multiplié par L. Le tableau ci-dessus est vérifié par `backend/src/modules/buildings/routes.spec.ts` (catalogue servi + formules de balance.ts) : changer la migration, ce tableau et ce test ensemble.
- Gare : coût et bonus à régler pendant la bêta (étape 6).

Règles :
- Un chantier occupe une **file de construction**. **Une seule file** par joueur ; une 2ᵉ s'achètera plus tard (boutique, voir 5.8). Pendant une amélioration, le bâtiment continue de produire au niveau actuel.
- Premier chantier du tutoriel : 10 secondes (`DUREE_CHANTIER_TUTORIEL_S`), seulement pour le tout premier chantier du joueur et tant que le tutoriel n'est ni fini ni passé.
- **Annuler un chantier** : rembourse **tout** son coût ; le bâtiment reste à son niveau actuel (une première construction annulée supprime le bâtiment). La file se libère.
- Le coût d'un chantier compte dans `invested_cash` dès qu'il est payé ; une annulation le retire.
- Démolition : rembourse 30 % de `invested_cash`. Pas pendant un chantier (l'annuler d'abord). Le siège social ne se démolit pas.
- **Siège social et capitale** : sa commune devient la capitale dès le début du chantier ; annuler sa première construction enlève la capitale. Le +1 territoire par niveau compte quand le chantier est fini.
- **Déplacer la capitale** : le siège (niveau compris) part sur une autre de mes communes, s'il y a 2 emplacements libres et pas d'OPA en cours ; **une fois tous les 7 jours** (`DELAI_DEPLACEMENT_CAPITALE_S`). Construire le siège ne compte pas comme un déplacement. Pas pendant un chantier du siège.
- Pas d'accélération payante des chantiers en V1.

## 5.3 Revenus passifs

- **Revenu du sol** : `R_sol = arrondi( 1 % × V0 )` par heure (`revenuSol`, taux `TAUX_REVENU_SOL`) (temps de retour d'un terrain nu ≈ 100 h)
- **Revenu d'un territoire** : `R_T = ( R_sol + Σ R_b ) × ( 1 + Σ bonus_b / 100 )` — `bonus_b` = 8 × niveau de l'équipement public + 10 × niveau de la gare
- **Revenu du joueur** : `R_J = Σ R_T × ( 1 + boost )`, avec `boost ≤ 25 %` (boost de quête ou de boutique, jamais cumulés au-delà)

### Calcul hors ligne (différentiel temporel)

```
Δt     = min( maintenant − income_collected_at ; 48 h )
cumul  = Σ R_J × Δt + reste            (en ₮ × secondes, un entier)
gain   = ⌊ cumul / 3 600 ⌋
reste  = cumul mod 3 600               (gardé dans users.income_remainder)
```

Le calcul se fait **par morceaux** : si un chantier s'est terminé pendant l'absence, on calcule jusqu'à sa date de fin avec l'ancien revenu, on applique le nouveau niveau, puis on continue. Le plafond de **48 h** (décidé à l'étape 3, au lieu de 24 h) ne punit pas un week-end d'absence et va avec les chantiers les plus longs ; au-delà, les revenus s'arrêtent jusqu'au retour du joueur.

Le **reste** évite de perdre les fractions : un joueur qui gagne 50 ₮/h et agit toutes les 30 s gagne 0,4 ₮ à chaque fois ; sans reste il ne toucherait jamais rien, avec le reste il touche bien 50 ₮ par heure (migration 004). Formules : `revenuCumule`, `partagerCumul`, `apportBatiment` (balance.ts) ; moteur : `backend/src/modules/income/revenus.ts`, vérifié en temps simulé par `revenus.spec.ts` (« on construit, on revient 2 h plus tard : 976 ₮ exactement »). Pas encore de boost : il arrive avec les quêtes et la boutique.

- Le revenu monte tout seul à l'écran ; le serveur l'encaisse à chaque action (avant un achat, un chantier…). Le bouton « Encaisser » sert au tutoriel et aux quêtes.
- Au retour, un **résumé** dit quels chantiers se sont terminés pendant l'absence (« la gare est passée au niveau 3 ») : `finishedWorks` de `GET /me`, jusqu'à ce que le joueur les marque lus. Les messages en direct arrivent à l'étape 4 (`building.done`).

## 5.4 Valeur, patrimoine, limites

- **Valeur d'un territoire** : `V_T = V0 + B + F` (`valeurTerritoire`) — `B` = somme des `invested_cash` de ses bâtiments, `F` = fortifications (défenses d'OPA)
- **Patrimoine** (classement, anti-acharnement des OPA) : `NW = cash + Σ V_T + séquestres d'OPA en cours` (`patrimoine` ; les gemmes ne comptent pas)
- **Achat** d'une commune libre : `V0`
- **Vente à l'État** : `arrondi_100_inférieur( 70 % × V_T )` ; ses bâtiments sont **détruits** (chantier en cours compris) et la commune redevient libre au prix `V0` (même règle que l'inactivité, 5.6)
- **Limite de territoires** : `max_territories = min( 12 ; 4 + niveau du siège + bonus de rang + emplacement acheté )` ; une OPA sortante en cours compte comme un territoire réservé. On démarre avec **4 territoires** (au lieu de 3, depuis que le siège s'arrête au niveau 5) : 4 + 5 + 2 + 1 = 12, le maximum reste atteignable

| Rang | Patrimoine | Bonus |
|---|---|---|
| 0 Entrepreneur | 0 | — |
| 1 Notable | 250 000 | badge |
| 2 Baron | 2 500 000 | +1 territoire |
| 3 Magnat | 25 000 000 | +1 territoire, 2 OPA sortantes simultanées |
| 4 Tycoon | 250 000 000 | badge et skin exclusifs |

- **Rang** = le plus haut seuil atteint (`rangDuPatrimoine`), recalculé toutes les 10 min par la tâche `leaderboard` (`CLASSEMENT_TOUTES_LES_S`). Il **ne redescend jamais** (`nouveauRang`, décidé au début de l'étape 5) : sinon une OPA perdue ferait perdre un emplacement et laisserait le joueur au-dessus de sa limite de territoires.
- Le skin du rang Tycoon attend la boutique (V2) ; en V1, chaque rang a son badge.

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

Formule : `montantsOpa` (balance.ts) ; les taux y sont en % entiers (150, 35, 5) : le calcul se fait en entiers, sans nombre à virgule.

En patrimoine, une OPA réussie coûte `0,5 × V_T` à l'attaquant et rapporte `0,5 × V_T` au défenseur : on paie une **prime** pour prendre une place rare (la limite de territoires rend chaque commune précieuse). Pour l'attaquant, l'intérêt est le revenu et le prestige de la commune ; pour le défenseur, garder une commune bien construite coûte de la trésorerie.

### Conditions pour lancer une OPA (sinon code d'erreur, voir [04-api.md](04-api.md))

- Le territoire a un propriétaire, qui n'est pas l'attaquant, et ce n'est **pas sa capitale**.
- Pas de **bouclier** actif (72 h après une défense, 48 h après une OPA réussie, 12 h après un achat).
- Le défenseur n'est plus en **protection débutant** (72 h) ; l'attaquant a un compte de **7 jours** minimum (anti-multi-comptes, `ANCIENNETE_ATTAQUANT_S` ; gardé à 7 jours au début de l'étape 4) et perd sa propre protection débutant s'il attaque.
- **Anti-acharnement** : 1 OPA sortante à la fois (2 au rang Magnat) ; un défenseur ne peut pas subir plus de 2 OPA en même temps ; même attaquant → même défenseur : 7 jours d'attente après un échec (OPA **défendue ou retirée**) ; impossible de viser un joueur dont le patrimoine est **inférieur à 25 %** du sien (`cibleTropPetite`).
- L'attaquant a une place libre (territoires + OPA en cours < `max_territories`) et le cash pour `P_OPA`.

## 5.6 Inactivité

- Activité = toute requête connectée (`last_active_at` mis à jour au plus toutes les 5 min).
- J+11 sans activité : notification « tes territoires seront libérés dans 3 jours ».
- **J+14** : chaque territoire est racheté par l'État pour `arrondi_100_inférieur( 50 % × (V0 + B) )` (`rachatInactivite` ; les fortifications ne comptent pas) (crédité au joueur, `inactivity_buyback`), ses bâtiments sont détruits, les OPA qui le visent sont annulées et remboursées, il redevient **libre au prix V0**. Le joueur passe `dormant` ; s'il revient (première requête connectée), il redevient `active`, garde son cash et repart. Ses revenus en attente (48 h au plus) lui sont versés avant le rachat.

## 5.7 Quêtes et tutoriel

- **Récompense d'une quête** : `max( cash_min ; arrondi_100( h × R_J ) )` (`recompenseQuete`) — `h` = 1 à 4 heures de revenu selon la difficulté (`reward_income_hours`), `R_J` = revenu par heure du joueur, figée au tirage. Elle reste utile du premier jour à la fin de partie.
- **Tirage** : chaque jour (heure de Paris), au premier appel, 1 quête facile + 1 moyenne + 1 difficile, tirées au hasard pondéré (`weight`) parmi celles dont le joueur remplit `min_territories`. Graine = `user_id + date` → même tirage si on recharge. S'il n'y a aucune quête possible pour une difficulté (un joueur sans commune n'a aucune quête moyenne), on tire une autre quête facile à la place.
- **Jour du jeu** : la date à Paris (`jourParis`, fuseau `Europe/Paris`, heure d'été comprise) ; les quêtes changent au prochain minuit à Paris (`prochainMinuitParis`). L'objectif est tiré entre `target_min` et `target_max` avec la même graine.
- **Ce qui compte** : « Repérage » et « Cap sur l'Outre-mer » comptent une même commune ou zone une seule fois par jour ; « Trésorier » ne compte que le clic sur « Encaisser » (`POST /me/collect`), pas l'encaissement automatique, et seulement s'il rapporte quelque chose, une fois par heure au plus (sinon trois clics de suite suffiraient) ; « Passer au bureau » se valide quand les quêtes du jour sont tirées. « Chef de chantier », « Grand chantier » et « Modernisation » comptent les chantiers **finis** : un chantier annulé est remboursé, il ne doit pas compter. Un chantier fini pendant l'absence du joueur ne fait avancer que des quêtes déjà tirées ce jour-là. Une récompense non réclamée reste réclamable après minuit.
- **Tutoriel** : 10 étapes, 10 000 ₮ et 5 💎 au total, versés aux étapes 5, 7 et 10 (colonnes `reward_cash` et `reward_gems` de `tutorials`). Proposé une fois aux joueurs déjà inscrits, avec « Passer » ; seules les étapes faites sont récompensées.

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
