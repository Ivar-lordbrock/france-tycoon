import {
  CLASSEMENT_PAR_PAGE,
  type ClassementQuery,
  type ClassementReponse,
  type ContenuNouveauRang,
  type LigneClassement,
  nouveauRang,
  type PorteeClassement,
  type ProfilPublic,
  type ZoneCode,
} from '@france-tycoon/shared';
import type { Base } from '../../db/connexion.ts';
import { ErreurMetier } from '../../erreurs.ts';
import { creerRecalculLimite } from '../buildings/limites.ts';
import { creerLecteurPatrimoine } from '../takeovers/patrimoine.ts';

// Classement (docs/05-equilibrage.md, 5.4 ; docs/04, « Classement »). La tâche `leaderboard` (toutes les 10 min)
// met en cache le patrimoine (`users.net_worth`) et le rang, qui ne redescend jamais ; les routes lisent ce cache.
// Sont classés les joueurs actifs (ni bannis, ni partis, ni libérés après 14 jours d'absence) ; à patrimoine égal,
// le compte le plus ancien passe devant.

/** Résumé gardé dans `job_runs.details`. */
export interface ResumeClassement {
  players: number;
  rankUps: number;
}

/** Recalcul du patrimoine et du rang de tous les joueurs actifs (tâche `leaderboard`). */
export function creerCalculClassement(db: Base) {
  const lirePatrimoine = creerLecteurPatrimoine(db);
  const recalculerLimite = creerRecalculLimite(db);
  const joueurs = db.prepare<[], { id: number; rang: number }>(
    "SELECT id, rank_level AS rang FROM users WHERE status = 'active' ORDER BY id",
  );
  const ecrire = db.prepare<{ id: number; patrimoine: number; rang: number; maintenant: number }>(
    'UPDATE users SET net_worth = @patrimoine, net_worth_updated_at = @maintenant, rank_level = @rang WHERE id = @id',
  );
  const notifier = db.prepare<[number, string, number]>(
    "INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, 'rank_up', ?, ?)",
  );

  return function recalculer(maintenant: number): ResumeClassement {
    return db
      .transaction((): ResumeClassement => {
        let rankUps = 0;
        const liste = joueurs.all();
        for (const { id, rang } of liste) {
          const patrimoine = Math.max(0, lirePatrimoine(id));
          const nouveau = nouveauRang(rang, patrimoine);
          ecrire.run({ id, patrimoine, rang: nouveau, maintenant });
          if (nouveau === rang) continue;
          // Baron et Magnat donnent un territoire de plus : la limite suit tout de suite.
          const contenu: ContenuNouveauRang = {
            rankLevel: nouveau,
            previousLevel: rang,
            maxTerritories: recalculerLimite(id),
          };
          notifier.run(id, JSON.stringify(contenu), maintenant);
          rankUps++;
        }
        return { players: liste.length, rankUps };
      })
      .immediate();
  };
}

/** `region:84` → région 84 ; sinon la portée telle quelle. */
function decouper(portee: PorteeClassement): { type: string; region: string | null } {
  return portee.startsWith('region:') ? { type: 'region', region: portee.slice(7) } : { type: portee, region: null };
}

const CLASSES = `
  WITH classes AS (
    SELECT u.id, u.pseudo, u.avatar_url AS avatar, u.marker_color AS markerColor, u.net_worth AS netWorth,
      u.rank_level AS rankLevel,
      (SELECT count(*) FROM territories WHERE owner_id = u.id) AS territories,
      row_number() OVER (ORDER BY u.net_worth DESC, u.created_at, u.id) AS rank
    FROM users AS u
    WHERE u.status = 'active' AND (@type = 'national' OR EXISTS (
      SELECT 1 FROM territories AS t WHERE t.owner_id = u.id
        AND CASE @type WHEN 'region' THEN t.region_code = @region ELSE t.region_type = @type END
    ))
  )`;

interface LigneSql extends LigneClassement {
  id: number;
}

const versLigne = ({ id: _, ...ligne }: LigneSql): LigneClassement => ligne;

/** Lecture du classement et des profils publics (à partir du cache de la tâche). */
export function creerClassement(db: Base) {
  const page = db.prepare<{ type: string; region: string | null; apres: number; nombre: number }, LigneSql>(
    `${CLASSES} SELECT * FROM classes WHERE rank > @apres ORDER BY rank LIMIT @nombre`,
  );
  const maLigne = db.prepare<{ type: string; region: string | null; moi: number }, LigneSql>(
    `${CLASSES} SELECT * FROM classes WHERE id = @moi`,
  );
  const misAJour = db.prepare<[], number | null>('SELECT max(net_worth_updated_at) FROM users').pluck();

  const joueur = db.prepare<[string], Omit<ProfilPublic, 'nationalRank' | 'territories'> & { id: number }>(`
    SELECT id, pseudo, avatar_url AS avatar, marker_color AS markerColor, rank_level AS rankLevel,
      net_worth AS netWorth, created_at AS createdAt
    FROM users WHERE pseudo = ? AND status IN ('active', 'dormant')`);
  const devant = db
    .prepare<{ id: number; patrimoine: number; creeLe: number }, number>(`
      SELECT count(*) FROM users
      WHERE status = 'active' AND id <> @id AND (net_worth > @patrimoine OR (net_worth = @patrimoine
        AND (created_at < @creeLe OR (created_at = @creeLe AND id < @id))))`)
    .pluck();
  const communes = db.prepare<[number], { insee: string; name: string; zone: ZoneCode; isCapital: number }>(`
    SELECT insee_code AS insee, name, zone_code AS zone, is_capital AS isCapital
    FROM territories WHERE owner_id = ? ORDER BY is_capital DESC, name`);

  return {
    /** GET /leaderboard : 50 joueurs à partir de `cursor`, ma ligne si je suis dans la portée. */
    lire({ scope, cursor = 0 }: ClassementQuery, moi: number | null): ClassementReponse {
      const portee = decouper(scope);
      const lignes = page.all({ ...portee, apres: cursor, nombre: CLASSEMENT_PAR_PAGE + 1 });
      const suite = lignes.length > CLASSEMENT_PAR_PAGE;
      const players = lignes.slice(0, CLASSEMENT_PAR_PAGE);
      const mienne = moi === null ? undefined : maLigne.get({ ...portee, moi });
      return {
        scope,
        players: players.map(versLigne),
        nextCursor: suite ? (players.at(-1)?.rank ?? null) : null,
        me: mienne ? versLigne(mienne) : null,
        updatedAt: misAJour.get() ?? null,
      };
    },

    /** GET /players/:pseudo : profil public (ni cash, ni gemmes, ni e-mail). */
    profil(pseudo: string): ProfilPublic {
      const j = joueur.get(pseudo);
      if (!j) throw new ErreurMetier('NOT_FOUND', 404, 'Joueur introuvable.');
      const { id, ...profil } = j;
      return {
        ...profil,
        nationalRank: 1 + (devant.get({ id, patrimoine: j.netWorth, creeLe: j.createdAt }) ?? 0),
        territories: communes.all(id).map((c) => ({ ...c, isCapital: c.isCapital === 1 })),
      };
    },
  };
}
