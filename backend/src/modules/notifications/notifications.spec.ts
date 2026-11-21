import type { AddressInfo } from 'node:net';
import {
  type EvenementDirect,
  evenementDirectSchema,
  NOTIFICATIONS_PAR_PAGE,
  notificationsReponseSchema,
} from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import { construireApp } from '../../app.ts';
import type { Base } from '../../db/connexion.ts';
import { appDeTest, baseDeTest, connecter } from '../../outils-test/base.ts';
import { insererCommunes } from '../../outils-test/communes.ts';
import { creerDirect, FLUX_MAX_PAR_JOUEUR } from './direct.ts';

const jour = 86_400;
const maintenant = () => Math.floor(Date.now() / 1000);

/** Bruno possède le village (avec une Résidence) et sa capitale ; Alice et lui peuvent lancer des OPA. */
async function partie(db: Base = baseDeTest(), app = appDeTest(db)) {
  insererCommunes(db, [
    { insee: '01001', nom: 'L’Abergement-Clémenciat', departement: '01', population: 859, valeur: 21_800 },
    { insee: '01004', nom: 'Ambérieu-en-Bugey', departement: '01', population: 14_000, valeur: 30_000 },
  ]);
  const alice = await connecter(app, 'Alice');
  const bruno = await connecter(app, 'Bruno');
  const sql = (requete: string, ...valeurs: unknown[]) => db.prepare(requete).run(...valeurs);
  sql("UPDATE territories SET owner_id = ? WHERE insee_code = '01001'", bruno.id);
  sql("UPDATE territories SET owner_id = ?, is_capital = 1 WHERE insee_code = '01004'", bruno.id);
  sql(
    "UPDATE users SET created_at = ?, newbie_shield_until = 0, cash = 100000 WHERE pseudo IN ('Alice', 'Bruno')",
    maintenant() - 30 * jour,
  );
  /** Un message pour `userId`, écrit directement en base. */
  const message = (userId: number, kind: string, payload: object, createdAt = maintenant()) =>
    Number(
      db
        .prepare('INSERT INTO notifications (user_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
        .run(userId, kind, JSON.stringify(payload), createdAt).lastInsertRowid,
    );
  /** Une Résidence en chantier vers le niveau 1, finie à `finAt`. */
  const chantier = (finAt: number) =>
    db.exec(`
      INSERT INTO buildings (territory_id, building_type_id, level, target_level, works_started_at, works_ends_at,
        works_cost, invested_cash)
      SELECT t.id, bt.id, 0, 1, ${finAt - 600}, ${finAt}, 4430, 4430 FROM territories AS t, building_types AS bt
      WHERE t.insee_code = '01001' AND bt.code = 'residence'`);
  const lancerOpa = async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/territories/01001/takeovers',
      headers: { cookie: alice.cookie },
    });
    expect(r.statusCode).toBe(200);
    return r.json().takeover as { id: number; expiresAt: number };
  };
  const cash = (userId: number) => db.prepare('SELECT cash FROM users WHERE id = ?').pluck().get(userId);
  return { db, app, alice, bruno, sql, message, chantier, lancerOpa, cash };
}

/** Un onglet de test : garde ce qu'on lui écrit et sait relire les événements. */
function onglet() {
  const recu: string[] = [];
  let ferme = false;
  return {
    flux: {
      ecrire: (texte: string) => recu.push(texte),
      fermer: () => {
        ferme = true;
      },
    },
    texte: () => recu.join(''),
    ferme: () => ferme,
    /** Les événements reçus, vérifiés par le schéma du contrat (les commentaires `: ping` sont ignorés). */
    evenements: (): EvenementDirect[] =>
      recu
        .join('')
        .split('\n\n')
        .filter((bloc) => bloc.startsWith('event: '))
        .map((bloc) => {
          const [ligneType, ligneData] = bloc.split('\n');
          return evenementDirectSchema.parse({
            type: ligneType?.slice('event: '.length),
            data: JSON.parse(ligneData?.slice('data: '.length) ?? 'null'),
          });
        }),
  };
}

const chantierFini = {
  buildingId: 1,
  territoryInsee: '01001',
  territoryName: 'L’Abergement-Clémenciat',
  typeCode: 'residence',
  name: 'Résidence',
  level: 1,
  finishedAt: 1_700_000_000,
};

describe('GET /me/notifications', () => {
  it('les plus récents d’abord, page par page, seulement les miens', async () => {
    const { app, alice, bruno, message } = await partie();
    const ids = Array.from({ length: 25 }, (_, i) =>
      i % 2 === 0
        ? message(bruno.id, 'building_done', { ...chantierFini, buildingId: i + 1 })
        : message(bruno.id, 'inactivity_warning', { releaseAt: 1_800_000_000 }),
    );
    message(alice.id, 'inactivity_warning', { releaseAt: 1_800_000_000 });

    const page1 = await app.inject({
      method: 'GET',
      url: '/api/v1/me/notifications',
      headers: { cookie: bruno.cookie },
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.headers['cache-control']).toBe('private, no-store');
    const corps1 = notificationsReponseSchema.parse(page1.json());
    const recents = [...ids].reverse();
    expect(corps1.notifications.map((n) => n.id)).toEqual(recents.slice(0, NOTIFICATIONS_PAR_PAGE));
    expect(corps1.nextCursor).toBe(recents[NOTIFICATIONS_PAR_PAGE - 1]);
    expect(corps1.unreadNotifications).toBe(25);
    expect(corps1.notifications[0]).toMatchObject({ kind: 'building_done', payload: { buildingId: 25 }, readAt: null });

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/me/notifications?before=${corps1.nextCursor}&limit=10`,
      headers: { cookie: bruno.cookie },
    });
    const corps2 = notificationsReponseSchema.parse(page2.json());
    expect(corps2.notifications.map((n) => n.id)).toEqual(recents.slice(NOTIFICATIONS_PAR_PAGE));
    expect(corps2.nextCursor).toBeNull();
  });

  it('un type inconnu du contrat n’est pas listé ; limite de 50 par page', async () => {
    const { app, bruno, message } = await partie();
    message(bruno.id, 'achievement_unlocked', { badge: 'demain' });
    const connu = message(bruno.id, 'inactivity_warning', { releaseAt: 1_800_000_000 });

    const r = await app.inject({ method: 'GET', url: '/api/v1/me/notifications', headers: { cookie: bruno.cookie } });
    expect(r.json().notifications.map((n: { id: number }) => n.id)).toEqual([connu]);

    const trop = await app.inject({
      method: 'GET',
      url: '/api/v1/me/notifications?limit=51',
      headers: { cookie: bruno.cookie },
    });
    expect(trop.statusCode).toBe(400);
  });

  it('encaisse d’abord : un chantier fini a déjà son message', async () => {
    const { app, bruno, chantier } = await partie();
    chantier(maintenant() - 60);

    const r = await app.inject({ method: 'GET', url: '/api/v1/me/notifications', headers: { cookie: bruno.cookie } });

    expect(r.json().notifications).toMatchObject([{ kind: 'building_done', payload: { name: 'Résidence', level: 1 } }]);
  });

  it('il faut être connecté (liste et flux)', async () => {
    const { app } = await partie();
    for (const url of ['/api/v1/me/notifications', '/api/v1/events']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('flux en direct (tic)', () => {
  it('OPA reçue : le défenseur est prévenu, pas l’attaquant ; rien de ce qui précède la connexion', async () => {
    const { db, alice, bruno, message, lancerOpa } = await partie();
    message(bruno.id, 'inactivity_warning', { releaseAt: 1_800_000_000 }); // avant la connexion
    const direct = creerDirect(db);
    const ongletAlice = onglet();
    const ongletBruno = onglet();
    direct.abonner(alice.id, ongletAlice.flux);
    direct.abonner(bruno.id, ongletBruno.flux);

    const opa = await lancerOpa();
    direct.tic(maintenant());

    expect(ongletBruno.evenements()).toMatchObject([
      {
        type: 'takeover.received',
        data: { kind: 'takeover_received', payload: { takeoverId: opa.id, attackerPseudo: 'Alice' } },
      },
    ]);
    expect(ongletAlice.evenements()).toEqual([]);
    direct.tic(maintenant());
    expect(ongletBruno.evenements()).toHaveLength(1); // pas deux fois
  });

  it('OPA défendue : l’attaquant reçoit l’issue puis son nouveau solde', async () => {
    const { db, app, alice, bruno, lancerOpa, cash } = await partie();
    const opa = await lancerOpa();
    const direct = creerDirect(db);
    const ongletAlice = onglet();
    direct.abonner(alice.id, ongletAlice.flux);

    const defense = await app.inject({
      method: 'POST',
      url: `/api/v1/takeovers/${opa.id}/defend`,
      headers: { cookie: bruno.cookie },
    });
    expect(defense.statusCode).toBe(200);
    direct.tic(maintenant());

    const evenements = ongletAlice.evenements();
    expect(evenements.map((e) => e.type)).toEqual(['takeover.resolved', 'wallet.changed']);
    expect(evenements[0]).toMatchObject({ data: { payload: { status: 'defended', role: 'attacker' } } });
    expect(evenements[1]).toEqual({
      type: 'wallet.changed',
      data: { cash: cash(alice.id), gems: 0, incomePerHour: expect.any(Number) },
    });
  });

  it('24 h sans réponse : la commune change de main à la seconde, les deux joueurs sont prévenus', async () => {
    const { db, alice, bruno, lancerOpa } = await partie();
    const opa = await lancerOpa();
    const direct = creerDirect(db);
    const ongletAlice = onglet();
    const ongletBruno = onglet();
    direct.abonner(alice.id, ongletAlice.flux);
    direct.abonner(bruno.id, ongletBruno.flux);

    direct.tic(opa.expiresAt - 1);
    expect(ongletAlice.evenements()).toEqual([]);
    direct.tic(opa.expiresAt);

    for (const [o, role] of [
      [ongletAlice, 'attacker'],
      [ongletBruno, 'defender'],
    ] as const) {
      const evenements = o.evenements();
      expect(evenements.map((e) => e.type)).toEqual(['takeover.resolved', 'wallet.changed']);
      expect(evenements[0]).toMatchObject({ data: { payload: { status: 'succeeded', role } } });
    }
    const proprietaire = db.prepare("SELECT owner_id FROM territories WHERE insee_code = '01001'").pluck().get();
    expect(proprietaire).toBe(alice.id);
  });

  it('chantier fini : le serveur le termine à l’heure pour un joueur connecté', async () => {
    const { db, bruno, chantier } = await partie();
    const fin = maintenant() + 10;
    chantier(fin);
    const direct = creerDirect(db);
    const ongletBruno = onglet();
    direct.abonner(bruno.id, ongletBruno.flux);

    direct.tic(fin - 1);
    expect(ongletBruno.evenements()).toEqual([]);
    direct.tic(fin);
    direct.tic(fin + 1); // le message écrit au passage d'avant part au suivant au plus tard

    expect(ongletBruno.evenements()).toMatchObject([
      { type: 'building.done', data: { payload: { name: 'Résidence', level: 1, finishedAt: fin } } },
    ]);
    expect(db.prepare('SELECT level, target_level AS cible FROM buildings').get()).toEqual({ level: 1, cible: null });
  });

  it('pas d’événement pour l’inactivité ; plusieurs onglets ; débrancher ; battement', async () => {
    const { db, bruno, message } = await partie();
    const direct = creerDirect(db);
    const onglets = Array.from({ length: FLUX_MAX_PAR_JOUEUR + 1 }, onglet);
    const debrancher = onglets.map((o) => direct.abonner(bruno.id, o.flux));
    expect(onglets[0]?.ferme()).toBe(true); // un onglet de trop : le plus ancien est fermé
    expect(onglets[1]?.ferme()).toBe(false);

    message(bruno.id, 'inactivity_warning', { releaseAt: 1_800_000_000 });
    message(bruno.id, 'takeover_resolved', {
      takeoverId: 1,
      territoryInsee: '01001',
      territoryName: 'L’Abergement-Clémenciat',
      status: 'cancelled',
      role: 'defender',
      otherPseudo: 'Alice',
    });
    const t = maintenant();
    direct.tic(t);
    for (const o of onglets.slice(1)) {
      expect(o.evenements().map((e) => e.type)).toEqual(['takeover.resolved', 'wallet.changed']);
      expect(o.texte()).toContain(': ping');
    }

    for (const d of debrancher) d();
    expect(direct.ecoutants()).toBe(0);
    message(bruno.id, 'inactivity_warning', { releaseAt: 1_800_000_000 });
    direct.tic(t + 1);
    expect(onglets[1]?.evenements()).toHaveLength(2);
  });
});

describe('GET /events (HTTP)', () => {
  it('flux SSE : en-têtes, puis l’OPA reçue arrive en direct ; l’arrêt du serveur ferme le flux', async () => {
    const db = baseDeTest();
    const app = construireApp({ db, auth: { devLogin: true }, direct: { intervalleMs: 20 } });
    const { bruno, lancerOpa } = await partie(db, app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;

    const reponse = await fetch(`http://127.0.0.1:${port}/api/v1/events`, { headers: { cookie: bruno.cookie } });
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const lecteur = reponse.body?.getReader();
    if (!lecteur) throw new Error('pas de corps');
    const decodeur = new TextDecoder();
    let recu = '';
    const lireJusqua = async (attendu: string) => {
      while (!recu.includes(attendu)) {
        const { value, done } = await lecteur.read();
        if (done) throw new Error(`flux fermé avant « ${attendu} » : ${recu}`);
        recu += decodeur.decode(value, { stream: true });
      }
    };

    await lireJusqua('retry: 5000\n\n');
    await lancerOpa();
    await lireJusqua('event: takeover.received\ndata: ');

    await app.close(); // ne reste pas bloqué sur la connexion ouverte
    expect((await lecteur.read()).done).toBe(true);
  });
});
