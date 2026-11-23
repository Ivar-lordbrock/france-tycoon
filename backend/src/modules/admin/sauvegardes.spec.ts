import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listeSauvegardesReponseSchema, sauvegardeReponseSchema } from '@france-tycoon/shared';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { construireApp } from '../../app.ts';
import { baseDeTest, connecter } from '../../outils-test/base.ts';

async function partie(dossierSauvegardes?: string) {
  const db = baseDeTest();
  const app = construireApp({ db, auth: { devLogin: true }, adminEmails: ['chef@dev.invalid'], dossierSauvegardes });
  const chef = await connecter(app, 'Chef');
  const modo = await connecter(app, 'Modo');
  const alice = await connecter(app, 'Alice');
  db.prepare("INSERT INTO staff_roles (user_id, role) VALUES (?, 'moderator')").run(modo.id);
  const appel = (cookie: string, method: 'GET' | 'POST') =>
    app.inject({ method, url: '/api/v1/admin/backups', headers: { cookie } });
  return { app, chef, modo, alice, appel };
}

describe('dashboard /admin : sauvegardes', () => {
  it('un admin copie la base ; l’équipe voit la liste ; le joueur et le modérateur ne sauvegardent pas', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'kadastr-sauvegardes-'));
    const { app, chef, modo, alice, appel } = await partie(dossier);

    expect((await appel(modo.cookie, 'POST')).statusCode).toBe(403);
    expect((await appel(alice.cookie, 'GET')).statusCode).toBe(403);

    const reponse = await appel(chef.cookie, 'POST');
    expect(reponse.statusCode).toBe(200);
    const { backup, deleted } = sauvegardeReponseSchema.parse(reponse.json());
    expect(deleted).toBe(0);
    expect(backup.name).toMatch(/^kadastr-\d{8}-\d{6}-\d{3}\.sqlite$/);
    expect(readdirSync(dossier)).toEqual([backup.name]);

    // La copie est une vraie base, avec les joueurs.
    const copie = new Database(join(dossier, backup.name), { readonly: true });
    expect(copie.prepare('SELECT count(*) FROM users').pluck().get()).toBe(3);
    copie.close();

    const liste = listeSauvegardesReponseSchema.parse((await appel(modo.cookie, 'GET')).json());
    expect(liste).toEqual({ backups: [backup], directory: dossier });
    expect(app.db.prepare("SELECT count(*) FROM admin_audit WHERE action = 'backup.create'").pluck().get()).toBe(1);
  });

  it('on garde les 20 plus récentes ; un reste de copie coupée est effacé', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'kadastr-sauvegardes-'));
    const anciennes = Array.from(
      { length: 20 },
      (_, i) => `kadastr-20200101-0000${String(i).padStart(2, '0')}-000.sqlite`,
    );
    for (const n of [...anciennes, 'kadastr-x.sqlite.partiel', 'note.txt']) writeFileSync(join(dossier, n), 'x');
    const { chef, appel } = await partie(dossier);

    const { backup, deleted } = sauvegardeReponseSchema.parse((await appel(chef.cookie, 'POST')).json());
    expect(deleted).toBe(1);
    const restent = readdirSync(dossier).sort();
    expect(restent).toHaveLength(21); // 20 copies + note.txt (pas à nous : on n'y touche pas)
    expect(restent).not.toContain(anciennes[0]);
    expect(restent).toContain(backup.name);
    expect(restent).not.toContain('kadastr-x.sqlite.partiel');
  });

  it('base en mémoire sans dossier : liste vide, sauvegarde refusée', async () => {
    const { chef, appel } = await partie();
    expect(listeSauvegardesReponseSchema.parse((await appel(chef.cookie, 'GET')).json())).toEqual({
      backups: [],
      directory: null,
    });
    expect((await appel(chef.cookie, 'POST')).statusCode).toBe(404);
  });
});
