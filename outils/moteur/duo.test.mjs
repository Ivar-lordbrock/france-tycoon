// Tests des outils du duo : `node --test outils/`
// Chaque test crée un faux « GitHub » (dépôt nu local), la copie de « moi » et celle du « binôme ».
// GitHub CLI est volontairement absent (DUO_GH=absent) : on teste tout ce qui ne dépend que de Git.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { numeroDansTitre } from './actions/fin-d-etape.mjs';
import { etatCI, fichiersRefuses, messageCommit, slug, trouverOutil } from './commun.mjs';

const DUO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'duo.mjs');
const GIT = trouverOutil('git');

const vide = path.join(mkdtempSync(path.join(tmpdir(), 'duo-config-')), 'gitconfig');
writeFileSync(vide, '');
const ENV = {
  ...process.env,
  NO_COLOR: '1',
  CLAUDECODE: '',
  DUO_GH: 'absent',
  GIT_CONFIG_GLOBAL: vide,
  GIT_CONFIG_NOSYSTEM: '1',
};

function g(cwd, ...args) {
  return execFileSync(GIT, args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function duo(cwd, args, { entree = '', env = {} } = {}) {
  const r = spawnSync(process.execPath, [DUO, ...args], {
    cwd,
    env: { ...ENV, ...env },
    encoding: 'utf8',
    input: entree,
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

function ecrire(dossier, fichier, contenu) {
  const chemin = path.join(dossier, fichier);
  mkdirSync(path.dirname(chemin), { recursive: true });
  writeFileSync(chemin, contenu);
}

function identite(depot, nom) {
  g(depot, 'config', 'user.name', nom);
  g(depot, 'config', 'user.email', `${nom}@exemple.test`);
}

/** Faux GitHub + copies de « moi » et du « binôme », sur dev. */
function preparer(t) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'duo-'));
  const avant = []; // à faire avant d'effacer (ex. arrêter un serveur qui tourne dans le dossier)
  t.after(async () => {
    for (const f of avant) await f();
    rmSync(dossier, { recursive: true, force: true });
  });
  const origine = path.join(dossier, 'origine.git');
  const moi = path.join(dossier, 'moi');
  const binome = path.join(dossier, 'binome');
  g(dossier, 'init', '--quiet', '--bare', '--initial-branch=dev', origine);
  g(dossier, 'init', '--quiet', '--initial-branch=dev', moi);
  identite(moi, 'moi');
  ecrire(moi, 'README.md', 'Kadastr\nligne 2\n');
  g(moi, 'add', '.');
  g(moi, 'commit', '--quiet', '-m', 'chore: départ');
  g(moi, 'remote', 'add', 'origin', origine);
  g(moi, 'push', '--quiet', '-u', 'origin', 'dev');
  g(moi, 'push', '--quiet', 'origin', 'dev:main');
  g(dossier, 'clone', '--quiet', origine, binome);
  identite(binome, 'binome');
  return { moi, binome, origine, avantNettoyage: (f) => avant.push(f) };
}

/** Le binôme ajoute un enregistrement sur dev (comme une proposition fusionnée). */
function binomeFusionneSurDev(binome, fichier, contenu, titre) {
  g(binome, 'switch', '--quiet', 'dev');
  g(binome, 'pull', '--quiet', '--ff-only');
  ecrire(binome, fichier, contenu);
  g(binome, 'add', '.');
  g(binome, 'commit', '--quiet', '-m', titre);
  g(binome, 'push', '--quiet', 'origin', 'dev');
}

const tete = (depot, ref = 'HEAD') => g(depot, 'rev-parse', ref);
const branche = (depot) => g(depot, 'branch', '--show-current');

// ---------------------------------------------------------------------------

describe('règles de nommage', () => {
  test('slug : sans accents, sans petits mots, 40 caractères au plus', () => {
    assert.equal(slug('Achat de territoire'), 'achat-territoire');
    assert.equal(slug("L'économie des OPA"), 'economie-opa');
    assert.equal(slug('Œuvre à la une'), 'oeuvre');
    assert.equal(slug('de la'), 'de-la');
    assert.equal(slug('  !!  '), '');
    assert.ok(slug('un très long sujet qui ne tiendrait jamais dans un nom de branche raisonnable').length <= 40);
  });

  test('message au format Conventional Commits déduit de la branche', () => {
    assert.equal(
      messageCommit('feat/api-achat-territoire', 'Ajout du bouton acheter.'),
      'feat(api): ajout du bouton acheter',
    );
    assert.equal(messageCommit('fix/map-zoom', 'OPA mal centrée'), 'fix(map): OPA mal centrée');
    assert.equal(messageCommit('feat/docs-guide', 'Guide du duo'), 'docs: guide du duo');
    assert.equal(messageCommit('feat/ci-outils', 'tests Windows'), 'ci: tests Windows');
    assert.equal(messageCommit('feat/api-x', 'test(api): cas limites'), 'test(api): cas limites');
    assert.equal(messageCommit('feat/api-x', 'nettoyage', { type: 'refactor' }), 'refactor(api): nettoyage');
    assert.equal(messageCommit('feat/outils-duo', 'essai'), 'chore: essai');
  });

  test('état des vérifications (CI)', () => {
    assert.equal(etatCI([]), 'aucune');
    assert.equal(etatCI([{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'verte');
    assert.equal(etatCI([{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }]), 'en-cours');
    assert.equal(
      etatCI([
        { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
      ]),
      'rouge',
    );
    assert.equal(etatCI([{ __typename: 'StatusContext', state: 'PENDING' }]), 'en-cours');
    assert.equal(etatCI([{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' }]), 'verte');
  });

  test('fichiers jamais envoyés', () => {
    const refuses = fichiersRefuses([
      { etat: 'nouveau', chemin: '.env' },
      { etat: 'nouveau', chemin: 'backend/.env.local' },
      { etat: 'nouveau', chemin: '.env.example' },
      { etat: 'nouveau', chemin: 'data/jeu.sqlite' },
      { etat: 'nouveau', chemin: 'cle.pem' },
      { etat: 'supprimé', chemin: 'vieux.db' },
    ]).map((f) => f.chemin);
    assert.deepEqual(refuses, ['.env', 'backend/.env.local', 'data/jeu.sqlite', 'cle.pem']);
  });

  test('fin d’étape : numéro lu dans le titre de la proposition', () => {
    assert.equal(numeroDansTitre('chore(release): étape 3 (v0.3.0)'), 3);
    assert.equal(numeroDansTitre('chore(release): Etape 12 (v0.12.0)'), 12);
    assert.ok(Number.isNaN(numeroDansTitre('chore(release): version spéciale')));
  });
});

describe('commencer une tâche', { concurrency: 4 }, () => {
  test('crée feat/<zone>-<sujet> depuis le dernier dev de GitHub', (t) => {
    const { moi, binome } = preparer(t);
    binomeFusionneSurDev(binome, 'carte.txt', 'carte\n', 'feat(map): carte');
    const r = duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'Achat de territoire']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'feat/api-achat-territoire');
    assert.equal(tete(moi), tete(moi, 'origin/dev'), 'la tâche part du dev de GitHub, avec le travail du binôme');
  });

  test('répond aux questions posées au clavier', (t) => {
    const { moi } = preparer(t);
    // 1 = nouvelle fonctionnalité, 4 = map
    const r = duo(moi, ['commencer'], { entree: '1\n4\nSélecteur de zones\n' });
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'feat/map-selecteur-zones');
  });

  test('sans clavier et sans option : demande l’option à passer', (t) => {
    const { moi } = preparer(t);
    const r = duo(moi, ['commencer', '--type', 'feat', '--zone', 'api']);
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /--sujet/);
    assert.equal(branche(moi), 'dev');
  });

  test('refuse s’il reste des modifications sur la tâche en cours', (t) => {
    const { moi } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'premiere']);
    ecrire(moi, 'nouveau.txt', 'x\n');
    const r = duo(moi, ['commencer', '--type', 'feat', '--zone', 'ui', '--sujet', 'seconde']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /pas encore envoyée/);
    assert.equal(branche(moi), 'feat/api-premiere');
  });

  test('des modifications faites sur dev par erreur suivent la nouvelle tâche', (t) => {
    const { moi } = preparer(t);
    ecrire(moi, 'README.md', 'Kadastr\nmodifié sur dev\n');
    const r = duo(moi, ['commencer', '--type', 'fix', '--zone', 'docs', '--sujet', 'readme']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'fix/docs-readme');
    assert.match(g(moi, 'status', '--porcelain'), /README\.md/);
  });

  test('reprend une tâche existante', (t) => {
    const { moi } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'premiere']);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'ui', '--sujet', 'seconde']);
    const r = duo(moi, ['commencer', '--reprendre', 'feat/api-premiere']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'feat/api-premiere');
  });
});

describe('envoyer mon travail', { concurrency: 4 }, () => {
  test('refuse sur dev, sans rien enregistrer', (t) => {
    const { moi } = preparer(t);
    const avant = tete(moi);
    ecrire(moi, 'README.md', 'changé\n');
    const r = duo(moi, ['envoyer', '--message', 'essai']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /on n'y enregistre jamais directement/);
    assert.equal(tete(moi), avant);
  });

  test('enregistre au bon format puis envoie sur GitHub', (t) => {
    const { moi, origine } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'Achat de territoire']);
    ecrire(moi, 'backend/achat.js', 'export const achat = 1;\n');
    const r = duo(moi, ['envoyer', '--message', 'Ajout du bouton acheter']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(g(moi, 'log', '-1', '--format=%s'), 'feat(api): ajout du bouton acheter');
    assert.equal(g(origine, 'rev-parse', 'refs/heads/feat/api-achat-territoire'), tete(moi));

    const encore = duo(moi, ['envoyer', '--message', 'rien']);
    assert.equal(encore.code, 0, encore.sortie);
    assert.match(encore.sortie, /Rien de nouveau à envoyer/);
  });

  test('sans clavier et sans message : demande --message', (t) => {
    const { moi } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'x']);
    ecrire(moi, 'a.txt', 'a\n');
    const r = duo(moi, ['envoyer']);
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /--message/);
    assert.equal(g(moi, 'log', '-1', '--format=%s'), 'chore: départ');
  });

  test('refuse les secrets et les fichiers trop gros', (t) => {
    const { moi } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'x']);
    ecrire(moi, 'cle.pem', 'secret\n');
    let r = duo(moi, ['envoyer', '--message', 'essai']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /cle\.pem/);
    rmSync(path.join(moi, 'cle.pem'));

    ecrire(moi, 'gros.bin', Buffer.alloc(2 * 1024 * 1024));
    r = duo(moi, ['envoyer', '--message', 'essai'], { env: { DUO_TAILLE_MAX_MO: '1' } });
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /trop gros/);
    assert.equal(g(moi, 'log', '-1', '--format=%s'), 'chore: départ', 'rien enregistré');
  });

  test('si la branche a changé sur GitHub : intègre puis envoie, sans forcer', (t) => {
    const { moi, binome } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'commun']);
    ecrire(moi, 'a.txt', 'a\n');
    duo(moi, ['envoyer', '--message', 'premier']);
    g(binome, 'fetch', '--quiet');
    g(binome, 'switch', '--quiet', 'feat/api-commun');
    ecrire(binome, 'b.txt', 'b\n');
    g(binome, 'add', '.');
    g(binome, 'commit', '--quiet', '-m', 'feat(api): part du binôme');
    g(binome, 'push', '--quiet');

    ecrire(moi, 'c.txt', 'c\n');
    const r = duo(moi, ['envoyer', '--message', 'second']);
    assert.equal(r.code, 0, r.sortie);
    assert.ok(existsSync(path.join(moi, 'b.txt')), 'le travail du binôme est intégré');
    assert.equal(tete(moi), tete(moi, 'origin/feat/api-commun'));
  });

  test('en cas de conflit avec GitHub : rien n’est perdu, aucune fusion à moitié', (t) => {
    const { moi, binome } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'commun']);
    ecrire(moi, 'a.txt', 'a\n');
    duo(moi, ['envoyer', '--message', 'premier']);
    g(binome, 'fetch', '--quiet');
    g(binome, 'switch', '--quiet', 'feat/api-commun');
    ecrire(binome, 'a.txt', 'version binôme\n');
    g(binome, 'commit', '--quiet', '-am', 'feat(api): binôme');
    g(binome, 'push', '--quiet');

    ecrire(moi, 'a.txt', 'ma version\n');
    const r = duo(moi, ['envoyer', '--message', 'ma version']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /conflit/);
    assert.equal(g(moi, 'log', '-1', '--format=%s'), 'feat(api): ma version', 'mon enregistrement est gardé');
    assert.equal(g(moi, 'status', '--porcelain'), '', 'aucune fusion laissée à moitié');
  });
});

describe('mettre à jour', { concurrency: 4 }, () => {
  test('sur dev : récupère le travail du binôme', (t) => {
    const { moi, binome } = preparer(t);
    binomeFusionneSurDev(binome, 'carte.txt', 'carte\n', 'feat(map): carte des communes');
    const r = duo(moi, ['mettre-a-jour']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(tete(moi), tete(moi, 'origin/dev'));
    assert.match(r.sortie, /feat\(map\): carte des communes/);
  });

  test('sur main : remet sur dev', (t) => {
    const { moi } = preparer(t);
    g(moi, 'switch', '--quiet', '-c', 'main', 'origin/main');
    const r = duo(moi, ['mettre-a-jour']);
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'dev');
  });

  test('sur une tâche : sans réponse, ne touche à rien et cite --integrer', (t) => {
    const { moi, binome } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'x']);
    const avant = tete(moi);
    binomeFusionneSurDev(binome, 'carte.txt', 'carte\n', 'feat(map): carte');
    const r = duo(moi, ['mettre-a-jour']);
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /--integrer/);
    assert.equal(tete(moi), avant);
  });

  test('sur une tâche avec --integrer : intègre le dernier dev', (t) => {
    const { moi, binome } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'x']);
    ecrire(moi, 'a.txt', 'a\n');
    duo(moi, ['envoyer', '--message', 'a']);
    binomeFusionneSurDev(binome, 'carte.txt', 'carte\n', 'feat(map): carte');
    const r = duo(moi, ['mettre-a-jour', '--integrer']);
    assert.equal(r.code, 0, r.sortie);
    g(moi, 'merge-base', '--is-ancestor', 'origin/dev', 'HEAD'); // échoue si dev n'est pas intégré
    assert.ok(existsSync(path.join(moi, 'carte.txt')));
  });

  test('conflit avec dev : tout est remis comme avant', (t) => {
    const { moi, binome } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'docs', '--sujet', 'readme']);
    ecrire(moi, 'README.md', 'Kadastr\nma ligne 2\n');
    duo(moi, ['envoyer', '--message', 'readme']);
    const avant = tete(moi);
    binomeFusionneSurDev(binome, 'README.md', 'Kadastr\nligne 2 du binôme\n', 'docs: readme');
    const r = duo(moi, ['mettre-a-jour', '--integrer']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /Conflit/);
    assert.equal(tete(moi), avant);
    assert.equal(g(moi, 'status', '--porcelain'), '');
  });
});

describe('garde-fous généraux', { concurrency: 4 }, () => {
  test('proposer sans GitHub CLI : explique quoi faire', (t) => {
    const { moi } = preparer(t);
    duo(moi, ['commencer', '--type', 'feat', '--zone', 'api', '--sujet', 'x']);
    ecrire(moi, 'a.txt', 'a\n');
    duo(moi, ['envoyer', '--message', 'a']);
    const r = duo(moi, ['proposer']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /GitHub CLI/);
  });

  test('refuse de travailler au milieu d’une fusion pas terminée', (t) => {
    const { moi } = preparer(t);
    g(moi, 'switch', '--quiet', '-c', 'feat/api-a');
    ecrire(moi, 'README.md', 'A\n');
    g(moi, 'commit', '--quiet', '-am', 'a');
    g(moi, 'switch', '--quiet', '-c', 'feat/api-b', 'dev');
    ecrire(moi, 'README.md', 'B\n');
    g(moi, 'commit', '--quiet', '-am', 'b');
    spawnSync(GIT, ['merge', 'feat/api-a'], { cwd: moi, env: ENV }); // conflit laissé en plan
    const r = duo(moi, ['envoyer', '--message', 'x']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /au milieu d'une opération/);
  });

  test('refuse en « HEAD détachée »', (t) => {
    const { moi } = preparer(t);
    g(moi, 'switch', '--quiet', '--detach', 'HEAD');
    const r = duo(moi, ['envoyer', '--message', 'x']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /aucune branche/);
  });

  test('hors du projet : message clair', (t) => {
    const dossier = mkdtempSync(path.join(tmpdir(), 'duo-hors-'));
    t.after(() => rmSync(dossier, { recursive: true, force: true }));
    const r = duo(dossier, ['etat']);
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, /pas une copie du projet/);
  });
});

// ---------------------------------------------------------------------------
// Fenêtre des outils (interface.mjs + mode interface du moteur)
// ---------------------------------------------------------------------------

/** Lignes « @@{json} » envoyées par le moteur en mode interface. */
const messages = (sortie) =>
  sortie
    .split(/\r?\n/)
    .filter((l) => l.startsWith('@@'))
    .map((l) => JSON.parse(l.slice(2)));

/** Démarre le serveur des outils sur un port libre ; renvoie son adresse et de quoi l'appeler. */
async function demarrerInterface({ moi: depot, avantNettoyage }) {
  const jeton = 'jeton-de-test-1234';
  const enfant = spawn(process.execPath, [DUO, 'interface', '--sans-navigateur', '--port', '0', '--jeton', jeton], {
    cwd: depot,
    env: ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const arret = new Promise((resoudre) => enfant.on('exit', resoudre));
  avantNettoyage(async () => {
    enfant.kill();
    await arret; // sinon Windows refuse d'effacer le dossier du test
  });
  const adresse = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const delai = setTimeout(() => rejeter(new Error(`Pas d'adresse :\n${sortie}`)), 15000);
    const lire = (morceau) => {
      sortie += morceau;
      const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(sortie);
      if (m) {
        clearTimeout(delai);
        resoudre(`http://127.0.0.1:${m[1]}`);
      }
    };
    enfant.stdout.on('data', lire);
    enfant.stderr.on('data', lire);
    enfant.on('exit', () => rejeter(new Error(`Le serveur s'est arrêté :\n${sortie}`)));
  });
  const appeler = async (chemin, corps, entetes = {}) => {
    const r = await fetch(`${adresse}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { 'x-jeton': jeton, 'content-type': 'application/json', ...entetes },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await r.text();
    let json = null;
    try {
      json = JSON.parse(texte);
    } catch {}
    return { statut: r.status, texte, json };
  };
  return { adresse, jeton, appeler, arret };
}

/** Suit le flux d'une action et répond aux questions dans l'ordre ; renvoie tous les messages reçus. */
async function suivreAction({ adresse, jeton, appeler }, id, reponses) {
  const r = await fetch(`${adresse}/api/flux?id=${id}&jeton=${jeton}`);
  assert.equal(r.status, 200);
  const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
  const recus = [];
  let tampon = '';
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) return recus;
    tampon += value;
    const blocs = tampon.split('\n\n');
    tampon = blocs.pop();
    for (const bloc of blocs) {
      const data = bloc.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      const m = JSON.parse(data.slice(6));
      recus.push(m);
      if (m.genre === 'question') await appeler('/api/repondre', { id, reponse: reponses.shift() ?? '' });
      if (m.genre === 'fin') return recus;
    }
  }
}

describe('fenêtre des outils', { concurrency: 4 }, () => {
  test('« Où j’en suis » en JSON, avec le conseil de la prochaine étape', (t) => {
    const { moi } = preparer(t);
    ecrire(moi, 'nouveau.txt', 'x\n');
    const r = duo(moi, ['etat', '--json']);
    assert.equal(r.code, 0, r.sortie);
    const e = JSON.parse(r.sortie.trim());
    assert.equal(e.branche, 'dev');
    assert.equal(e.surTache, false);
    assert.deepEqual(
      e.modifications.map((m) => m.chemin),
      ['nouveau.txt'],
    );
    assert.equal(e.conseil.action, 'commencer');
    assert.equal(e.avecGitHub, false);
  });

  test('mode interface : questions en JSON, réponses par l’entrée, boutons cités', (t) => {
    const { moi } = preparer(t);
    const r = duo(moi, ['commencer'], { entree: 'feat\nmap\nSélecteur de zones\n', env: { DUO_INTERFACE: '1' } });
    assert.equal(r.code, 0, r.sortie);
    assert.equal(branche(moi), 'feat/map-selecteur-zones');
    const m = messages(r.sortie);
    const questions = m.filter((x) => x.genre === 'question');
    assert.deepEqual(
      questions.map((q) => q.forme),
      ['choix', 'choix', 'texte'],
    );
    assert.ok(questions[1].choix.some((c) => c.valeur === 'map' && c.detail));
    assert.match(m.find((x) => x.genre === 'suite').texte, /« Envoyer mon travail »/);
    assert.ok(!r.sortie.split('\n').some((l) => l.trim() && !l.startsWith('@@')), 'rien d’autre que du JSON');
  });

  test('mode interface : « Annuler » arrête proprement, sans rien créer', (t) => {
    const { moi } = preparer(t);
    const r = duo(moi, ['commencer'], { entree: 'feat\n', env: { DUO_INTERFACE: '1' } });
    assert.equal(r.code, 2, r.sortie);
    const dernier = messages(r.sortie).at(-1);
    assert.equal(dernier.genre, 'stop');
    assert.match(dernier.texte, /^Annulé/);
    assert.equal(branche(moi), 'dev');
  });

  test('serveur : jeton et adresse exigés, actions limitées', async (t) => {
    const depots = preparer(t);
    const { moi } = depots;
    const { adresse, appeler } = await demarrerInterface(depots);

    assert.equal((await fetch(`${adresse}/`)).status, 403, 'sans jeton');
    assert.equal((await appeler('/api/ping', undefined, { 'x-jeton': 'mauvais-jeton-0000' })).statut, 403);
    const page = await appeler('/');
    assert.equal(page.statut, 200);
    assert.match(page.texte, /"commencer":"Commencer une tâche"/);
    assert.doesNotMatch(page.texte, /\/\*CONFIG\*\//);

    // Un autre site qui se ferait passer pour 127.0.0.1 (« DNS rebinding ») : refusé.
    const statutHote = await new Promise((resoudre, rejeter) => {
      const u = new URL(adresse);
      request(
        { host: '127.0.0.1', port: u.port, path: '/api/ping', headers: { host: 'pirate.test', 'x-jeton': 'x' } },
        (res) => {
          res.resume();
          resoudre(res.statusCode);
        },
      )
        .on('error', rejeter)
        .end();
    });
    assert.equal(statutHote, 403);
    const origine = await appeler('/api/action', { action: 'commencer' }, { origin: 'https://pirate.test' });
    assert.equal(origine.statut, 403, 'requête venue d’un autre site');

    assert.equal((await appeler('/api/action', { action: 'etat' })).statut, 400, 'action hors liste');
    assert.equal((await appeler('/api/action', { action: 'commencer', options: { sujet: 'x' } })).statut, 400);
    assert.equal(
      (await appeler('/api/action', { action: 'commencer', options: { reprendre: '--force' } })).statut,
      400,
      'option déguisée',
    );
    assert.equal(branche(moi), 'dev', 'rien n’a été lancé');
  });

  test('serveur : « Où j’en suis », puis une action avec ses questions, de bout en bout', async (t) => {
    const depots = preparer(t);
    const { moi } = depots;
    const serveur = await demarrerInterface(depots);

    const etat = await serveur.appeler('/api/etat');
    assert.equal(etat.statut, 200, etat.texte);
    assert.equal(etat.json.etat.branche, 'dev');

    const lancement = await serveur.appeler('/api/action', { action: 'commencer' });
    assert.equal(lancement.statut, 200, lancement.texte);
    const recus = await suivreAction(serveur, lancement.json.id, ['fix', 'ui', 'Bouton acheter']);
    assert.equal(recus.at(-1).genre, 'fin');
    assert.equal(recus.at(-1).code, 0, JSON.stringify(recus, null, 1));
    assert.equal(recus.filter((m) => m.genre === 'question').length, 3);
    assert.ok(recus.some((m) => m.genre === 'ok'));
    assert.equal(branche(moi), 'fix/ui-bouton-acheter');

    const apres = await serveur.appeler('/api/etat');
    assert.equal(apres.json.etat.branche, 'fix/ui-bouton-acheter');
    assert.equal(apres.json.etat.surTache, true);
  });

  test('serveur : la fenêtre fermée arrête les outils en quelques secondes', async (t) => {
    const depots = preparer(t);
    const serveur = await demarrerInterface(depots);
    const verrou = path.join(depots.moi, '.git', 'duo-interface.json');
    assert.ok(existsSync(verrou), 'la fenêtre ouverte est notée (pour ne pas en ouvrir deux)');
    assert.equal((await serveur.appeler('/api/au-revoir', {})).statut, 200);
    const debut = Date.now();
    const code = await Promise.race([
      serveur.arret,
      new Promise((r) => setTimeout(() => r('toujours là'), 30000).unref()),
    ]);
    assert.equal(code, 0);
    assert.ok(Date.now() - debut < 20000);
    assert.ok(!existsSync(verrou), 'la note est effacée');
  });
});
