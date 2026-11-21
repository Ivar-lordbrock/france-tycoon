import {
  CAPITAL_DEPART,
  CLASSEMENT_PAR_PAGE,
  classementReponseSchema,
  contenuNouveauRangSchema,
  profilPublicSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { creerCalculClassement } from './classement.ts';

// Classement et rangs (docs/05-equilibrage.md, 5.4 ; docs/04, « Quêtes, tutoriel, classement »).
// Rangs : Notable dès 250 000 ₮ de patrimoine, Baron dès 2 500 000 ₮ (+1 territoire).

const maintenant = () => Math.floor(Date.now() / 1000);

/** Alice, Bruno et Chloé (inscrits dans cet ordre) ; trois communes : Ain (84), Bouches-du-Rhône (93), Guadeloupe. */
async function partie() {
  const db = baseDeTest();
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', region: '84', valeur: 100_000 },
    { insee: '13001', nom: 'Aix-en-Provence', departement: '13', region: '93', valeur: 50_000 },
    { insee: '97101', nom: 'Les Abymes', departement: '971', zone: 'GP', region: '01', valeur: 40_000 },
  ]);
  const app = appDeTest(db);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const chloe = await connecter(app, 'Chloe');
  // Inscriptions à une minute d'écart : à patrimoine égal, le plus ancien passe devant.
  for (const [i, j] of [alice, bruno, chloe].entries()) {
    db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(maintenant() - 600 + i * 60, j.id);
  }
  const recalculer = creerCalculClassement(db);
  const poserCash = (id: number, cash: number) => db.prepare('UPDATE users SET cash = ? WHERE id = ?').run(cash, id);
  const donner = (id: number, insee: string, capitale = false) =>
    db
      .prepare('UPDATE territories SET owner_id = ?, is_capital = ? WHERE insee_code = ?')
      .run(id, capitale ? 1 : 0, insee);
  const statut = (id: number, s: string) => db.prepare('UPDATE users SET status = ? WHERE id = ?').run(s, id);
  const joueur = (id: number) =>
    db
      .prepare('SELECT net_worth AS patrimoine, rank_level AS rang, max_territories AS limite FROM users WHERE id = ?')
      .get(id) as { patrimoine: number; rang: number; limite: number };
  const messagesRang = (id: number) =>
    (
      db.prepare("SELECT payload FROM notifications WHERE user_id = ? AND kind = 'rank_up' ORDER BY id").all(id) as {
        payload: string;
      }[]
    ).map((n) => contenuNouveauRangSchema.parse(JSON.parse(n.payload)));
  const classement = async (scope?: string, { cookie, cursor }: { cookie?: string; cursor?: number } = {}) => {
    const reponse = await app.inject({
      method: 'GET',
      url: '/api/v1/leaderboard',
      query: { ...(scope ? { scope } : {}), ...(cursor ? { cursor: String(cursor) } : {}) },
      headers: cookie ? { cookie } : {},
    });
    return { reponse, corps: classementReponseSchema.parse(reponse.json()) };
  };
  const pseudos = (corps: { players: { pseudo: string }[] }) => corps.players.map((p) => p.pseudo);
  return {
    db,
    app,
    alice,
    bruno,
    chloe,
    recalculer,
    poserCash,
    donner,
    statut,
    joueur,
    messagesRang,
    classement,
    pseudos,
  };
}

describe('tâche leaderboard', () => {
  it('patrimoine = cash + valeur des communes, à partir du cash enregistré', async () => {
    const p = await partie();
    p.poserCash(p.bruno.id, 10_000);
    p.donner(p.bruno.id, '01001');
    p.donner(p.bruno.id, '97101');

    const t = maintenant();
    expect(p.recalculer(t)).toEqual({ players: 3, rankUps: 0 });

    expect(p.joueur(p.bruno.id).patrimoine).toBe(10_000 + 100_000 + 40_000);
    expect(p.joueur(p.alice.id).patrimoine).toBe(CAPITAL_DEPART);
    expect(p.db.prepare('SELECT net_worth_updated_at FROM users WHERE id = ?').pluck().get(p.bruno.id)).toBe(t);
  });

  it('nouveau rang : un message ; Baron donne un territoire de plus ; le rang ne redescend jamais', async () => {
    const p = await partie();
    const limiteDepart = p.joueur(p.alice.id).limite;

    p.poserCash(p.alice.id, 300_000);
    expect(p.recalculer(maintenant())).toEqual({ players: 3, rankUps: 1 });
    expect(p.joueur(p.alice.id)).toMatchObject({ rang: 1, limite: limiteDepart });

    p.poserCash(p.alice.id, 3_000_000);
    p.recalculer(maintenant());
    expect(p.joueur(p.alice.id)).toMatchObject({ rang: 2, limite: limiteDepart + 1 });

    // Patrimoine retombé à 0 (OPA perdue, dépenses) : le rang et la limite restent.
    p.poserCash(p.alice.id, 0);
    expect(p.recalculer(maintenant())).toEqual({ players: 3, rankUps: 0 });
    expect(p.joueur(p.alice.id)).toEqual({ patrimoine: 0, rang: 2, limite: limiteDepart + 1 });

    expect(p.messagesRang(p.alice.id)).toEqual([
      { rankLevel: 1, previousLevel: 0, maxTerritories: limiteDepart },
      { rankLevel: 2, previousLevel: 1, maxTerritories: limiteDepart + 1 },
    ]);
    expect(p.messagesRang(p.bruno.id)).toEqual([]);
  });

  it('les comptes bannis ou endormis ne sont pas recalculés', async () => {
    const p = await partie();
    p.poserCash(p.chloe.id, 300_000);
    p.statut(p.chloe.id, 'banned');

    expect(p.recalculer(maintenant())).toEqual({ players: 2, rankUps: 0 });
    expect(p.joueur(p.chloe.id)).toMatchObject({ patrimoine: 0, rang: 0 });
  });
});

describe('GET /leaderboard', () => {
  it('national : patrimoine décroissant, le plus ancien devant à égalité ; ma ligne ; heure du calcul', async () => {
    const p = await partie();
    const avant = await p.classement();
    expect(avant.reponse.headers['cache-control']).toBe('private, no-store');
    expect(avant.corps).toMatchObject({ scope: 'national', updatedAt: null, nextCursor: null, me: null });
    expect(p.pseudos(avant.corps)).toEqual(['Alice', 'Bruno', 'Chloe']); // tous à 0 : ordre d'inscription

    p.poserCash(p.chloe.id, 300_000);
    p.donner(p.bruno.id, '13001');
    const t = maintenant();
    p.recalculer(t);
    const { corps } = await p.classement('national', { cookie: p.bruno.cookie });

    expect(corps.players).toEqual([
      {
        rank: 1,
        pseudo: 'Chloe',
        avatar: null,
        markerColor: expect.any(String),
        netWorth: 300_000,
        territories: 0,
        rankLevel: 1,
      },
      expect.objectContaining({ rank: 2, pseudo: 'Bruno', netWorth: CAPITAL_DEPART + 50_000, territories: 1 }),
      expect.objectContaining({ rank: 3, pseudo: 'Alice', netWorth: CAPITAL_DEPART }),
    ]);
    expect(corps.me).toMatchObject({ rank: 2, pseudo: 'Bruno' });
    expect(corps.updatedAt).toBe(t);
  });

  it('seuls les joueurs actifs sont classés', async () => {
    const p = await partie();
    p.statut(p.alice.id, 'banned');
    p.statut(p.bruno.id, 'dormant');

    const { corps } = await p.classement('national', { cookie: p.bruno.cookie });

    expect(p.pseudos(corps)).toEqual(['Chloe']);
    expect(corps.players[0]?.rank).toBe(1);
    expect(corps.me).toBeNull();
  });

  it('métropole, Outre-mer, région : ceux qui y possèdent une commune, classés par patrimoine total', async () => {
    const p = await partie();
    p.donner(p.alice.id, '01001');
    p.donner(p.alice.id, '97101');
    p.donner(p.bruno.id, '13001');
    p.recalculer(maintenant());

    expect(p.pseudos((await p.classement('metropole')).corps)).toEqual(['Alice', 'Bruno']);
    const outreMer = (await p.classement('outre_mer', { cookie: p.bruno.cookie })).corps;
    expect(outreMer.players).toMatchObject([{ rank: 1, pseudo: 'Alice', territories: 2 }]);
    expect(outreMer.me).toBeNull();
    const provence = (await p.classement('region:93', { cookie: p.bruno.cookie })).corps;
    expect(provence).toMatchObject({ scope: 'region:93', players: [{ rank: 1, pseudo: 'Bruno' }], me: { rank: 1 } });
    expect((await p.classement('region:84')).corps.players.map((l) => l.pseudo)).toEqual(['Alice']);
    expect((await p.classement('region:11')).corps.players).toEqual([]);
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/leaderboard?scope=monde' })).statusCode).toBe(400);
  });

  it(`${CLASSEMENT_PAR_PAGE} par page, puis la suite avec le curseur`, async () => {
    const p = await partie();
    const ajouter = p.db.prepare(
      'INSERT INTO users (google_id, email, pseudo, net_worth, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let i = 1; i <= CLASSEMENT_PAR_PAGE; i++) {
      ajouter.run(`g${i}`, `j${i}@exemple.fr`, `Joueur${i}`, 1_000_000 - i, maintenant() - 10_000);
    }

    const premiere = (await p.classement('national', { cookie: p.chloe.cookie })).corps;
    expect(premiere.players).toHaveLength(CLASSEMENT_PAR_PAGE);
    expect(premiere.players.at(-1)).toMatchObject({
      rank: CLASSEMENT_PAR_PAGE,
      pseudo: `Joueur${CLASSEMENT_PAR_PAGE}`,
    });
    expect(premiere.nextCursor).toBe(CLASSEMENT_PAR_PAGE);
    expect(premiere.me).toMatchObject({ rank: CLASSEMENT_PAR_PAGE + 3, pseudo: 'Chloe' });

    const suite = (await p.classement('national', { cursor: premiere.nextCursor ?? 0 })).corps;
    expect(suite.players.map((l) => [l.rank, l.pseudo])).toEqual([
      [CLASSEMENT_PAR_PAGE + 1, 'Alice'],
      [CLASSEMENT_PAR_PAGE + 2, 'Bruno'],
      [CLASSEMENT_PAR_PAGE + 3, 'Chloe'],
    ]);
    expect(suite.nextCursor).toBeNull();
  });
});

describe('GET /players/:pseudo', () => {
  it('profil public : rang national, communes (capitale d’abord), rien de privé', async () => {
    const p = await partie();
    p.poserCash(p.bruno.id, 500_000);
    p.donner(p.bruno.id, '13001', true);
    p.donner(p.bruno.id, '01001');
    p.recalculer(maintenant());

    const reponse = await p.app.inject({ method: 'GET', url: '/api/v1/players/bRuNo' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['cache-control']).toBe('private, no-store');
    const profil = profilPublicSchema.parse(reponse.json());
    expect(Object.keys(reponse.json()).sort()).toEqual(Object.keys(profilPublicSchema.shape).sort());
    expect(profil).toMatchObject({ pseudo: 'Bruno', rankLevel: 1, netWorth: 650_000, nationalRank: 1, avatar: null });
    expect(profil.territories).toEqual([
      { insee: '13001', name: 'Aix-en-Provence', zone: 'MET', isCapital: true },
      { insee: '01001', name: 'L’Abergement-Clémenciat', zone: 'MET', isCapital: false },
    ]);
    const chloe = profilPublicSchema.parse(
      (await p.app.inject({ method: 'GET', url: '/api/v1/players/Chloe' })).json(),
    );
    expect(chloe.nationalRank).toBe(3); // à égalité avec Alice, inscrite avant elle
  });

  it('pseudo inconnu ou compte banni : 404 ; compte endormi : visible', async () => {
    const p = await partie();
    p.statut(p.alice.id, 'banned');
    p.statut(p.bruno.id, 'dormant');

    const inconnu = await p.app.inject({ method: 'GET', url: '/api/v1/players/Personne' });
    expect(inconnu.statusCode).toBe(404);
    expect(inconnu.json().error.code).toBe('NOT_FOUND');
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/players/Alice' })).statusCode).toBe(404);
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/players/Bruno' })).statusCode).toBe(200);
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/players/ab' })).statusCode).toBe(400);
  });
});
