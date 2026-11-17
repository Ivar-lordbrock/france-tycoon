# scripts/import — remplir la table des communes

Étapes (détail dans [docs/02-stack-technique.md](../../docs/02-stack-technique.md#24-données-géographiques--import-et-cache)) :

1. `npm run import:communes` : API Geo → `territories`, contours simplifiés, index spatial, recherche
2. `npm run import:bpe` : équipements INSEE (BPE 2025, Métropole et DROM) → `territory_stats` (quelques secondes)
3. `npm run import:osm` : gares, aéroports, ports, monuments, musées et attractions partout, plus tous les équipements dans les collectivités d'outre-mer (Overpass, une requête par département toutes les 5 s, ≈ 30 min) → `territory_stats`

`bpe` et `osm` recalculent ensuite I, V0 et les emplacements de toutes les communes avec `shared/src/balance.ts`, sans toucher aux propriétaires ni aux bâtiments. Chaque étape est rejouable.

Si Overpass est surchargé (erreur 429 ou 5xx cinq fois de suite), `import:osm` s'arrête : il suffit de le relancer, les départements déjà reçus sont relus depuis `data/raw/osm/` sans nouvelle requête.

Les téléchargements bruts vont dans `data/raw/` (ignoré par Git). Respecter les services : 1 requête/seconde sur l'API Geo, pauses sur Overpass.
