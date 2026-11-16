# shared — code commun front + back (à deux)

- `src/api/` : schémas zod de chaque route (le « contrat », écrit en début d'étape)
- `src/balance.ts` : toutes les constantes et formules d'équilibrage ([docs/05-equilibrage.md](../docs/05-equilibrage.md))
- `src/zones.ts` : les 12 zones (nom, boîte, zoom), générées par l'import

Toute modification ici touche les deux côtés : à discuter dans la PR.
