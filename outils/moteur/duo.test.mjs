// Tests des outils du duo : `node --test outils/`
// Chaque test crée un faux « GitHub » (dépôt nu local), la copie de « moi » et celle du « binôme ».
// GitHub CLI est volontairement absent (DUO_GH=absent) : on teste tout ce qui ne dépend que de Git.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
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
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const origine = path.join(dossier, 'origine.git');
  const moi = path.join(dossier, 'moi');
  const binome = path.join(dossier, 'binome');
  g(dossier, 'init', '--quiet', '--bare', '--initial-branch=dev', origine);
  g(dossier, 'init', '--quiet', '--initial-branch=dev', moi);
  identite(moi, 'moi');
  ecrire(moi, 'README.md', 'France Tycoon\nligne 2\n');
  g(moi, 'add', '.');
  g(moi, 'commit', '--quiet', '-m', 'chore: départ');
  g(moi, 'remote', 'add', 'origin', origine);
  g(moi, 'push', '--quiet', '-u', 'origin', 'dev');
  g(moi, 'push', '--quiet', 'origin', 'dev:main');
  g(dossier, 'clone', '--quiet', origine, binome);
  identite(binome, 'binome');
  return { moi, binome, origine };
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
    ecrire(moi, 'README.md', 'France Tycoon\nmodifié sur dev\n');
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
    ecrire(moi, 'README.md', 'France Tycoon\nma ligne 2\n');
    duo(moi, ['envoyer', '--message', 'readme']);
    const avant = tete(moi);
    binomeFusionneSurDev(binome, 'README.md', 'France Tycoon\nligne 2 du binôme\n', 'docs: readme');
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
