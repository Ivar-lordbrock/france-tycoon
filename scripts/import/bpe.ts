// Import des équipements INSEE (Base permanente des équipements 2025, par IRIS) → territory_stats,
// puis recalcul de I, V0 et des emplacements de toutes les communes.
//
//   npm run import:bpe                        télécharge le zip (≈ 4 Mo) une fois dans data/raw/bpe
//   npm run import:bpe -- --fichier <zip>     avec un autre fichier BPE de l'INSEE
//
// La BPE couvre la Métropole et les DROM ; les collectivités d'outre-mer viennent d'OSM (import:osm).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chargerFichierEnv, lireConfig, RACINE } from '../../backend/src/config.ts';
import { fermerBase, ouvrirBase } from '../../backend/src/db/connexion.ts';
import { appliquerMigrations } from '../../backend/src/db/migrations.ts';
import { compterBpe } from './lib/bpe.ts';
import { ecrireEquipements, recalculerValeurs } from './lib/equipements.ts';
import { lireZip } from './lib/zip.ts';

const URL_BPE = 'https://www.insee.fr/fr/statistiques/fichier/8217527/ds_bpe_iris_2025_geo_2025.zip';

const { values: options } = parseArgs({
  options: { fichier: { type: 'string' }, base: { type: 'string' } },
});

chargerFichierEnv();
const cheminBase = options.base ? resolve(options.base) : lireConfig().cheminBase;
const cheminZip = options.fichier
  ? resolve(options.fichier)
  : join(RACINE, 'data/raw/bpe', URL_BPE.split('/').at(-1) ?? '');

if (!existsSync(cheminZip)) {
  if (options.fichier) throw new Error(`Fichier introuvable : ${cheminZip}`);
  console.log(`Téléchargement de ${URL_BPE}`);
  const reponse = await fetch(URL_BPE, { headers: { 'user-agent': 'france-tycoon-import/0.1' } });
  if (!reponse.ok) throw new Error(`INSEE : HTTP ${reponse.status}`);
  mkdirSync(dirname(cheminZip), { recursive: true });
  writeFileSync(cheminZip, Buffer.from(await reponse.arrayBuffer()));
}

const csv = lireZip(readFileSync(cheminZip)).find((f) => f.nom.toLowerCase().endsWith('.csv'));
if (!csv) throw new Error(`Pas de fichier CSV dans ${cheminZip}`);
const comptes = compterBpe(csv.lire().toString('utf8'));

const db = ouvrirBase(cheminBase);
appliquerMigrations(db);
if (db.prepare('SELECT count(*) FROM territories').pluck().get() === 0) {
  throw new Error('Aucune commune en base : lance d’abord npm run import:communes');
}
const { communes, inconnues } = ecrireEquipements(db, 'bpe', comptes);
const changees = recalculerValeurs(db);
fermerBase(db);

console.log(`BPE : ${communes} communes avec des équipements, ${changees} valeurs recalculées.`);
if (inconnues.length > 0) {
  // Fusions de communes entre la géographie de la BPE et celle de l'API Geo.
  console.warn(
    `  ⚠ ${inconnues.length} code(s) INSEE de la BPE absents de la base : ${inconnues.slice(0, 20).join(', ')}…`,
  );
}
