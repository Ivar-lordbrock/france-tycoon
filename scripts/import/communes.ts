// Import des communes : API Geo → territories, territory_geometries, territories_rtree (+ recherche FTS).
//
//   npm run import:communes                         toutes les zones (≈ 110 requêtes, 1 par seconde)
//   npm run import:communes -- --departements 972   un ou plusieurs départements (séparés par des virgules)
//   npm run import:communes -- --hors-ligne         seulement depuis le cache data/raw/api-geo
//
// Un import complet régénère aussi frontend/public/geo/{departements,france}.json et shared/src/zones.generees.ts.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { COLLECTIVITES_OUTRE_MER, NOMS_ZONES, type ZoneCode, zoneDuDepartement } from '@france-tycoon/shared';
import { chargerFichierEnv, lireConfig, RACINE } from '../../backend/src/config.ts';
import { fermerBase, ouvrirBase } from '../../backend/src/db/connexion.ts';
import { appliquerMigrations } from '../../backend/src/db/migrations.ts';
import { creerClientApiGeo } from './lib/api-geo.ts';
import { estRejet, type TerritoireImporte, versTerritoire } from './lib/communes.ts';
import { type ContourDepartement, contoursAlleges, fusionner } from './lib/contours.ts';
import { communesDisparues, creerEcrivain, lireComptesInfra } from './lib/ecriture.ts';
import { type Boite, nombreDePoints } from './lib/geometrie.ts';
import { fichierZones, unirBoites } from './lib/sorties.ts';

const { values: options } = parseArgs({
  options: {
    departements: { type: 'string' },
    'hors-ligne': { type: 'boolean', default: false },
    base: { type: 'string' },
    sorties: { type: 'boolean', default: false },
  },
});

chargerFichierEnv();
const config = lireConfig();
const cheminBase = options.base ? resolve(options.base) : config.cheminBase;
const debut = performance.now();
const secondes = (depuis: number) => ((performance.now() - depuis) / 1000).toFixed(1);
const mo = (octets: number) => `${(octets / 1e6).toFixed(1)} Mo`;

const db = ouvrirBase(cheminBase);
appliquerMigrations(db);
const ecrire = creerEcrivain(db);
const comptesInfra = lireComptesInfra(db);
const client = creerClientApiGeo({
  dossierCache: join(RACINE, 'data/raw/api-geo'),
  horsLigne: options['hors-ligne'],
  journal: (message) => console.log(`  ${message}`),
});

const tous = [...(await client.departements()), ...COLLECTIVITES_OUTRE_MER].filter((d) => zoneDuDepartement(d.code));
const demandes = options.departements?.split(',').map((code) => code.trim().toUpperCase());
const inconnus = demandes?.filter((code) => !tous.some((d) => d.code === code)) ?? [];
if (inconnus.length > 0) throw new Error(`Département(s) inconnu(s) : ${inconnus.join(', ')}`);
const choisis = demandes ? tous.filter((d) => demandes.includes(d.code)) : tous;
const complet = !demandes;

console.log(`Import de ${choisis.length} départements et collectivités dans ${cheminBase}`);

const contours: ContourDepartement[] = [];
const boitesZones = new Map<ZoneCode, Boite>();
let boiteCorse: Boite | undefined;
const importees = new Set<string>();
const parZone = new Map<ZoneCode, number>();
const totaux = { brut: 0, low: 0, high: 0, octetsLow: 0, octetsHigh: 0, rejets: 0 };

for (const [index, departement] of choisis.entries()) {
  const tDepartement = performance.now();
  const collection = await client.communes(departement.code);
  const territoires: TerritoireImporte[] = [];

  for (const commune of collection.features) {
    const resultat = versTerritoire(commune, comptesInfra.get(commune.properties.code));
    if (estRejet(resultat)) {
      totaux.rejets++;
      console.warn(`  ⚠ ${resultat.insee} ignorée : ${resultat.raison}`);
      continue;
    }
    territoires.push(resultat);
  }
  if (territoires.length === 0) throw new Error(`Aucune commune pour ${departement.code} ${departement.nom}`);

  ecrire(territoires);

  const zone = territoires[0]?.zone as ZoneCode;
  for (const t of territoires) {
    importees.add(t.insee);
    boitesZones.set(zone, unirBoites(boitesZones.get(zone), t.boite));
    if (t.departement === '2A' || t.departement === '2B') boiteCorse = unirBoites(boiteCorse, t.boite);
    totaux.brut += nombreDePoints(t.geometrie);
    totaux.low += t.contourLow.split('],[').length;
    totaux.high += t.contourHigh.split('],[').length;
    totaux.octetsLow += t.contourLow.length;
    totaux.octetsHigh += t.contourHigh.length;
  }
  parZone.set(zone, (parZone.get(zone) ?? 0) + territoires.length);
  contours.push({
    code: departement.code,
    nom: departement.nom,
    zone,
    geometrie: fusionner(territoires.map((t) => t.geometrie)),
  });

  console.log(
    `[${index + 1}/${choisis.length}] ${departement.code} ${departement.nom} : ${territoires.length} communes (${secondes(tDepartement)} s)`,
  );
}

if (complet || options.sorties) {
  const tSorties = performance.now();
  const { departements, zones } = contoursAlleges(contours, {
    poidsMin: 2e-5, // ≈ 0,7 pixel² au zoom 8 : départements ≈ 0,7 Mo
    poidsMinZones: 5e-6, // masque gris plus fidèle, visible aussi en zoomant : ≈ 0,5 Mo
    decimales: 3,
  });
  const ecrireFichier = (relatif: string, contenu: string) => {
    const chemin = join(RACINE, relatif);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, contenu);
    console.log(`  écrit ${relatif} (${mo(contenu.length)})`);
  };
  ecrireFichier('frontend/public/geo/departements.json', JSON.stringify(departements));
  ecrireFichier('frontend/public/geo/france.json', JSON.stringify(zones));
  if (complet) {
    if (!boiteCorse) throw new Error('Corse absente de l’import');
    ecrireFichier('shared/src/zones.generees.ts', fichierZones(boitesZones, boiteCorse));
  }
  console.log(`Contours allégés en ${secondes(tSorties)} s`);
}

if (complet) {
  const disparues = communesDisparues(db, importees);
  for (const { insee, possedee } of disparues) {
    console.warn(`  ⚠ ${insee} est en base mais plus dans l’API Geo${possedee ? ' (possédée par un joueur !)' : ''}`);
  }
}

fermerBase(db);

console.log(`\nTerminé en ${secondes(debut)} s, ${client.requetes} requête(s) à l’API Geo, ${totaux.rejets} rejet(s).`);
for (const [zone, n] of parZone) console.log(`  ${zone.padEnd(3)} ${NOMS_ZONES[zone].padEnd(26)} ${n} communes`);
console.log(
  `Points : ${totaux.brut} bruts → ${totaux.low} (low, ${mo(totaux.octetsLow)}) / ${totaux.high} (high, ${mo(totaux.octetsHigh)})`,
);
if (cheminBase !== ':memory:') console.log(`Base : ${mo(statSync(cheminBase).size)} (hors WAL)`);
