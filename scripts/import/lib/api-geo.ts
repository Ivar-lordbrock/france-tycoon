import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export const URL_API_GEO = 'https://geo.api.gouv.fr';

/** Champs demandés pour chaque commune (le centre est recalculé à partir du contour). */
const CHAMPS_COMMUNE = 'nom,code,codeDepartement,codeRegion,population,surface,contour';

export interface DepartementApi {
  code: string;
  nom: string;
  codeRegion: string;
}

export interface ProprietesCommuneApi {
  nom: string;
  code: string;
  codeDepartement: string;
  codeRegion?: string;
  population?: number;
  /** En hectares. */
  surface?: number;
}

export type CommunesApi = FeatureCollection<Polygon | MultiPolygon | null, ProprietesCommuneApi>;

export interface OptionsClient {
  /** Dossier du cache des réponses brutes (`data/raw/api-geo`). */
  dossierCache: string;
  /** Délai minimal entre deux requêtes : 1 s pour respecter l'API Geo. */
  intervalleMs?: number;
  /** Interdit le réseau : échoue si une réponse manque dans le cache. */
  horsLigne?: boolean;
  fetch?: typeof fetch;
  attendre?: (ms: number) => Promise<void>;
  maintenant?: () => number;
  journal?: (message: string) => void;
}

const pause = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms));

/**
 * Client de l'API Geo : une requête par seconde au plus, réponses gardées sur disque
 * pour ne jamais re-télécharger (supprimer le fichier pour forcer).
 */
export function creerClientApiGeo(options: OptionsClient) {
  const {
    dossierCache,
    intervalleMs = 1000,
    horsLigne = false,
    fetch: telecharger = globalThis.fetch,
    attendre = pause,
    maintenant = Date.now,
    journal = () => {},
  } = options;
  let derniereRequete = Number.NEGATIVE_INFINITY;
  let requetes = 0;

  async function obtenir<T>(fichier: string, chemin: string): Promise<T> {
    const cache = join(dossierCache, fichier);
    if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as T;
    if (horsLigne) throw new Error(`Hors ligne : ${cache} absent du cache`);

    for (let essai = 1; ; essai++) {
      const reste = derniereRequete + intervalleMs - maintenant();
      if (reste > 0) await attendre(reste);
      derniereRequete = maintenant();
      requetes++;

      let probleme: string;
      try {
        const reponse = await telecharger(`${URL_API_GEO}${chemin}`, {
          headers: { accept: 'application/json', 'user-agent': 'france-tycoon-import/0.1' },
        });
        if (reponse.ok) {
          const texte = await reponse.text();
          const donnees = JSON.parse(texte) as T; // vérifie la réponse avant de la garder
          mkdirSync(dossierCache, { recursive: true });
          writeFileSync(cache, texte);
          journal(`téléchargé ${fichier} (${(texte.length / 1e6).toFixed(1)} Mo)`);
          return donnees;
        }
        if (reponse.status !== 429 && reponse.status < 500) {
          throw new Error(`API Geo ${chemin} : HTTP ${reponse.status}`, { cause: 'definitif' });
        }
        probleme = `HTTP ${reponse.status}`;
      } catch (erreur) {
        if (erreur instanceof Error && erreur.cause === 'definitif') throw erreur;
        probleme = erreur instanceof Error ? `${erreur.message} ${(erreur.cause as Error)?.message ?? ''}` : 'erreur';
      }
      if (essai >= 4) throw new Error(`API Geo ${chemin} : ${probleme} (4 essais)`);
      journal(`${probleme.trim()} sur ${fichier}, nouvel essai dans ${essai * 5} s`);
      await attendre(essai * 5000);
    }
  }

  return {
    departements: () => obtenir<DepartementApi[]>('departements.json', '/departements?fields=nom,code,codeRegion'),
    communes: (codeDepartement: string) =>
      obtenir<CommunesApi>(
        `communes-${codeDepartement}.json`,
        `/communes?codeDepartement=${encodeURIComponent(codeDepartement)}&fields=${CHAMPS_COMMUNE}&format=geojson&geometry=contour`,
      ),
    get requetes() {
      return requetes;
    },
  };
}
