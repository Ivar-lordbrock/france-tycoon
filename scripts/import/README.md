# scripts/import — remplir la table des communes

Étapes (détail dans [docs/02-stack-technique.md](../../docs/02-stack-technique.md#24-données-géographiques--import-et-cache)) :

1. `communes` : API Geo → `territories`, contours simplifiés, index spatial, recherche
2. `bpe` : équipements INSEE → `territory_stats`
3. `osm` : gares, monuments, attractions (Overpass) → `territory_stats`
4. `valeurs` : calcul de I, V0, emplacements avec `shared/src/balance.ts`

Les téléchargements bruts vont dans `data/raw/` (ignoré par Git). Respecter les services : 1 requête/seconde sur l'API Geo, pauses sur Overpass.
