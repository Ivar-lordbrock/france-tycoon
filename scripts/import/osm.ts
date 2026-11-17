// Import OpenStreetMap (Overpass) → territory_stats, puis recalcul de I, V0 et des emplacements.
// Partout : gares, aéroports, ports, monuments historiques, musées et attractions.
// Collectivités d'outre-mer (pas de BPE) : aussi commerces, services, santé, écoles, loisirs, hôtels, restaurants.
//
//   npm run import:osm                         tous les départements (une requête toutes les 5 s, ≈ 30 min)
//   npm run import:osm -- --departements 987   un ou plusieurs départements (séparés par des virgules)
//   npm run import:osm -- --hors-ligne         seulement depuis le cache data/raw/osm
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type CategorieInfra, COLLECTIVITES_OUTRE_MER } from '@france-tycoon/shared';
import { chargerFichierEnv, lireConfig, RACINE } from '../../backend/src/config.ts';
import { fermerBase, ouvrirBase } from '../../backend/src/db/connexion.ts';
import { appliquerMigrations } from '../../backend/src/db/migrations.ts';
import type { ComptesParCommune } from './lib/bpe.ts';
import { ecrireEquipements, recalculerValeurs } from './lib/equipements.ts';
import { categoriesOsm, creerClientOverpass, creerLocalisateur, requeteOverpass } from './lib/osm.ts';

const { values: options } = parseArgs({
  options: {
    departements: { type: 'string' },
    'hors-ligne': { type: 'boolean', default: false },
    base: { type: 'string' },
  },
});

chargerFichierEnv();
const cheminBase = options.base ? resolve(options.base) : lireConfig().cheminBase;
const db = ouvrirBase(cheminBase);
appliquerMigrations(db);

const tous = db
  .prepare<[], { code: string; ouest: number; sud: number; est: number; nord: number }>(`
    SELECT t.department_code AS code, min(r.min_lng) AS ouest, min(r.min_lat) AS sud, max(r.max_lng) AS est, max(r.max_lat) AS nord
    FROM territories AS t JOIN territories_rtree AS r ON r.id = t.id
    GROUP BY t.department_code ORDER BY t.department_code`)
  .all();
if (tous.length === 0) throw new Error('Aucune commune en base : lance d’abord npm run import:communes');
const demandes = options.departements?.split(',').map((code) => code.trim().toUpperCase());
const inconnus = demandes?.filter((code) => !tous.some((d) => d.code === code)) ?? [];
if (inconnus.length > 0) throw new Error(`Département(s) absent(s) de la base : ${inconnus.join(', ')}`);
const choisis = demandes ? tous.filter((d) => demandes.includes(d.code)) : tous;

const client = creerClientOverpass({
  dossierCache: join(RACINE, 'data/raw/osm'),
  horsLigne: options['hors-ligne'],
  journal: (message) => console.log(`  ${message}`),
});
const localiser = creerLocalisateur(db);
const collectivites = new Set(COLLECTIVITES_OUTRE_MER.map((c) => c.code));
const debut = performance.now();
let horsCommune = 0;

for (const [index, d] of choisis.entries()) {
  const collectivite = collectivites.has(d.code);
  const elements = await client.elements(
    `${d.code}.json`,
    requeteOverpass([d.ouest, d.sud, d.est, d.nord], collectivite),
  );
  const comptes: ComptesParCommune = new Map();
  const parCategorie = new Map<CategorieInfra, number>();
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const categories = categoriesOsm(e.tags, collectivite);
    if (lat === undefined || lng === undefined || categories.length === 0) continue;
    const insee = localiser(lng, lat, d.code);
    if (!insee) {
      horsCommune++;
      continue;
    }
    const commune = comptes.get(insee) ?? {};
    for (const categorie of categories) {
      commune[categorie] = (commune[categorie] ?? 0) + 1;
      parCategorie.set(categorie, (parCategorie.get(categorie) ?? 0) + 1);
    }
    comptes.set(insee, commune);
  }
  ecrireEquipements(db, 'osm', comptes, d.code);
  const resume = [...parCategorie].map(([categorie, n]) => `${categorie} ${n}`).join(', ');
  console.log(`[${index + 1}/${choisis.length}] ${d.code} : ${comptes.size} communes (${resume || 'rien'})`);
}

const changees = recalculerValeurs(db);
fermerBase(db);
console.log(
  `\nTerminé en ${((performance.now() - debut) / 1000).toFixed(0)} s, ${client.requetes} requête(s) Overpass, ` +
    `${changees} valeurs recalculées (${horsCommune} objet(s) hors des communes, ou chez le voisin).`,
);
