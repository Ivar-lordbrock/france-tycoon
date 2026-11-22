// Boîte à outils partagée par les actions du duo (voir duo.mjs).
// Trouve Git et GitHub CLI même s'ils ne sont pas dans le PATH, lance les commandes,
// pose les questions et affiche des messages simples en français.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

// ---------------------------------------------------------------------------
// Règles du projet
// ---------------------------------------------------------------------------

/** Branches sur lesquelles on ne travaille jamais directement. */
export const BRANCHES_PROTEGEES = new Set(['main', 'dev']);

export const TYPES = {
  feat: 'une nouvelle fonctionnalité',
  fix: "la correction d'un problème",
};

export const ZONES = {
  api: 'le serveur (routes, règles du jeu)',
  db: 'la base de données (tables, migrations)',
  data: "l'import des communes et des données",
  map: 'la carte (affichage, zones, sélection)',
  ui: "l'interface (écrans, boutons, menus)",
  shared: 'le code commun au serveur et au site (types, formules)',
  docs: 'la documentation',
  ci: 'les vérifications automatiques et les outils',
};

const TYPES_COMMIT = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'perf', 'ci'];

/** Noms des outils : fichier à double-cliquer, commande Claude Code, bouton de l'interface. */
export const OUTILS = {
  installer: ['1-installer-mon-poste (dans le dossier outils)', null, 'Vérifier mon poste'],
  'mettre-a-jour': ['2-mettre-a-jour', '/mettre-a-jour', 'Mettre à jour'],
  commencer: ['3-commencer-une-tache', '/commencer', 'Commencer une tâche'],
  envoyer: ['4-envoyer-mon-travail', '/envoyer', 'Envoyer mon travail'],
  proposer: ['5-proposer-mon-travail', '/proposer', 'Proposer mon travail'],
  etat: ['6-ou-j-en-suis', '/ou-j-en-suis', "Où j'en suis"],
  fusionner: ['7-fusionner', '/fusionner', 'Fusionner'],
  'fin-d-etape': ['8-fin-d-etape', '/fin-d-etape', "Fin d'étape"],
};

/** Lancé par l'interface (fenêtre) : messages et questions passent en lignes « @@{json} ». */
export const modeInterface = process.env.DUO_INTERFACE === '1';

/** Nom à citer dans les messages : le bouton dans l'interface, la commande dans Claude Code, sinon le fichier. */
export function nomOutil(action) {
  const [fichier, commande, bouton] = OUTILS[action];
  if (modeInterface) return `« ${bouton} »`;
  return process.env.CLAUDECODE && commande ? commande : fichier;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Erreur « propre » : un garde-fou a refusé, ou il manque quelque chose. Rien n'a été cassé. */
export class Stop extends Error {
  constructor(message, codeSortie = 1) {
    super(message);
    this.name = 'Stop';
    this.codeSortie = codeSortie;
  }
}

const avecCouleurs = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const teinte = (code) => (texte) => (avecCouleurs ? `\x1b[${code}m${texte}\x1b[0m` : String(texte));
export const gras = teinte('1');
export const vert = teinte('32');
export const jaune = teinte('33');
export const rouge = teinte('31');
export const gris = teinte('90');
export const cyan = teinte('36');

/** Envoie un message à l'interface : une ligne « @@{"genre": …} ». */
export function emettre(genre, donnees = {}) {
  process.stdout.write(`@@${JSON.stringify({ genre, ...donnees })}\n`);
}

let silence = false;
/** Plus aucun message (ex. « Où j'en suis » en JSON pour l'interface). */
export function seTaire() {
  silence = true;
}

const FORMATS = {
  titre: (texte) => `\n${gras(cyan(texte))}\n`,
  section: (texte) => `\n${gras(texte)}`,
  ok: (texte) => `${vert('OK')}  ${texte}`,
  info: (texte) => `    ${texte}`,
  etape: (texte) => gris(`... ${texte}`),
  attention: (texte) => `${jaune('Attention')}  ${texte}`,
  suite: (texte) => `\n${gras('Et maintenant ?')} ${texte}`,
};

export const dire = Object.fromEntries(
  Object.entries(FORMATS).map(([genre, format]) => [
    genre,
    (texte) => {
      if (silence) return;
      if (modeInterface) emettre(genre, { texte: String(texte) });
      else console.log(format(texte));
    },
  ]),
);

/** « 1 fichier », « 3 fichiers ». */
export const nombre = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/** « il y a 5 min », « il y a 2 h », « il y a 3 j ». */
export function ilYA(dateIso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateIso).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

// ---------------------------------------------------------------------------
// Questions (marche au clavier, et avec des réponses envoyées par un tuyau)
// ---------------------------------------------------------------------------

let lecteur = null;

function lignes() {
  if (lecteur) return lecteur;
  const rl = createInterface({ input: process.stdin, terminal: false });
  const enAttente = [];
  const enReserve = [];
  let ferme = false;
  rl.on('line', (ligne) => {
    const suivant = enAttente.shift();
    if (suivant) suivant(ligne);
    else enReserve.push(ligne);
  });
  rl.on('close', () => {
    ferme = true;
    for (const suivant of enAttente.splice(0)) suivant(null);
  });
  lecteur = {
    suivante() {
      if (enReserve.length) return Promise.resolve(enReserve.shift());
      if (ferme) return Promise.resolve(null);
      return new Promise((resoudre) => enAttente.push(resoudre));
    },
    fermer: () => rl.close(),
  };
  return lecteur;
}

export function fermerQuestions() {
  lecteur?.fermer();
}

/**
 * Pose une question et renvoie la réponse (ou la valeur par défaut si on appuie sur Entrée).
 * Sans clavier (ex. lancé par Claude), une question obligatoire arrête l'outil en citant l'option à passer.
 * `interface` : comment l'interface doit la présenter ({ question, genre, choix }), si ce n'est pas un texte libre.
 */
export async function demander(question, { defaut = '', option, facultatif = false, interface: vue } = {}) {
  if (modeInterface) {
    const { genre: forme = 'texte', ...reste } = vue ?? {};
    emettre('question', { forme, question: question.split('\n')[0], defaut, facultatif, ...reste });
  } else {
    const indice = defaut ? gris(` (Entrée = ${defaut})`) : '';
    process.stdout.write(`\n${gras('?')} ${question}${indice}\n> `);
  }
  const reponse = await lignes().suivante();
  if (reponse === null) {
    process.stdout.write('\n');
    if (facultatif) return defaut;
    if (modeInterface) throw new Stop('Annulé : la suite n’a pas été lancée.', 2);
    const indiceOption = option ? ` Sans clavier, passe l'option ${option}.` : '';
    throw new Stop(`Il manque une réponse à la question : « ${question.split('\n')[0]} ».${indiceOption}`, 2);
  }
  return reponse.replace(/^﻿/, '').trim() || defaut;
}

/** Question oui/non. `deja` = la réponse a été donnée par une option (ex. --oui). `danger` : l'interface met en garde. */
export async function confirmer(question, { deja = false, option = '--oui', danger = false } = {}) {
  if (deja) return true;
  const reponse = await demander(`${question} (oui/non)`, {
    option,
    interface: { genre: 'oui-non', question, danger },
  });
  return /^(o|oui|y|yes)$/i.test(reponse);
}

/** Choix dans une liste numérotée. `choix` = [{ valeur, libelle, detail? }]. */
export async function choisir(question, choix, { defaut, option } = {}) {
  const liste = choix
    .map((c, i) => `  ${i + 1}. ${c.detail ? `${c.libelle.padEnd(7)} ${c.detail}` : c.libelle}`)
    .join('\n');
  const indexDefaut = choix.findIndex((c) => c.valeur === defaut);
  for (;;) {
    const reponse = await demander(`${question}\n${liste}\nTape le numéro`, {
      defaut: indexDefaut >= 0 ? String(indexDefaut + 1) : '',
      option,
      interface: { genre: 'choix', question, choix, defaut: indexDefaut >= 0 ? String(indexDefaut + 1) : '' },
    });
    const rang = Number.parseInt(reponse, 10);
    if (rang >= 1 && rang <= choix.length) return choix[rang - 1].valeur;
    const parNom = choix.find((c) => String(c.valeur) === reponse);
    if (parNom) return parNom.valeur;
    dire.attention(`Réponse non comprise : « ${reponse} ». Tape un numéro entre 1 et ${choix.length}.`);
  }
}

// ---------------------------------------------------------------------------
// Trouver Git et GitHub CLI (même absents du PATH)
// ---------------------------------------------------------------------------

const EMPLACEMENTS = {
  git: [path.join('Git', 'cmd', 'git.exe')],
  gh: [path.join('GitHub CLI', 'gh.exe')],
};

const MESSAGE_ABSENT = {
  git: `Git est introuvable sur ce PC. Lance d'abord ${nomOutil('installer')}.`,
  gh: `GitHub CLI (gh) est introuvable sur ce PC. Lance d'abord ${nomOutil('installer')}.`,
};

const trouves = new Map();

/** Chemin de l'outil, ou null. DUO_GIT / DUO_GH permettent de forcer un chemin (ou « absent » pour les tests). */
export function trouverOutil(nom) {
  if (trouves.has(nom)) return trouves.get(nom);
  const force = process.env[`DUO_${nom.toUpperCase()}`];
  let exe = null;
  if (force) {
    exe = force === 'absent' ? null : force;
  } else {
    const essai = spawnSync(nom, ['--version'], { windowsHide: true, stdio: 'ignore' });
    if (!essai.error && essai.status === 0) {
      exe = nom;
    } else {
      const bases = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
      ].filter(Boolean);
      exe = bases.flatMap((base) => EMPLACEMENTS[nom].map((rel) => path.join(base, rel))).find(existsSync) ?? null;
    }
  }
  trouves.set(nom, exe);
  return exe;
}

let environnementCache = null;

/** Variables d'environnement des commandes : PATH complété, et aucune question cachée de Git ou gh. */
function environnement() {
  if (environnementCache) return environnementCache;
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_MERGE_AUTOEDIT: 'no',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
  };
  const cle = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const dossiers = ['git', 'gh']
    .map(trouverOutil)
    .filter((exe) => exe && path.isAbsolute(exe))
    .map((exe) => path.dirname(exe));
  if (dossiers.length) env[cle] = [...dossiers, env[cle] ?? ''].join(path.delimiter);
  environnementCache = env;
  return env;
}

/** Lance une commande et renvoie { code, sortie, erreur }. Arrête l'outil si elle échoue (sauf autoriserEchec). */
export function lancer(nom, args, { entree, autoriserEchec = false } = {}) {
  const exe = trouverOutil(nom);
  if (!exe) throw new Stop(MESSAGE_ABSENT[nom]);
  const r = spawnSync(exe, args, {
    env: environnement(),
    encoding: 'utf8',
    input: entree,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Stop(`Impossible de lancer ${nom} : ${r.error.message}`);
  const resultat = { code: r.status ?? 1, sortie: (r.stdout ?? '').trimEnd(), erreur: (r.stderr ?? '').trim() };
  if (resultat.code !== 0 && !autoriserEchec) {
    throw new Stop(`La commande « ${nom} ${args.join(' ')} » a échoué :\n${resultat.erreur || resultat.sortie}`);
  }
  return resultat;
}

export const git = (args, options) => lancer('git', ['-c', 'core.quotepath=false', ...args], options);
export const gh = (args, options) => lancer('gh', args, options);
/** Sortie texte d'une commande git qui doit réussir. */
export const gitTexte = (...args) => git(args).sortie;

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

let githubPret = false;

export function exigerGitHub() {
  if (githubPret) return;
  if (!trouverOutil('gh')) throw new Stop(MESSAGE_ABSENT.gh);
  const r = gh(['auth', 'status', '--hostname', 'github.com'], { autoriserEchec: true });
  if (r.code !== 0) {
    throw new Stop(
      `Tu n'es pas connecté à GitHub sur ce PC (ou internet ne répond pas). Lance ${nomOutil('installer')} : il s'occupe de la connexion.`,
    );
  }
  githubPret = true;
}

export function githubDisponible() {
  try {
    exigerGitHub();
    return true;
  } catch {
    return false;
  }
}

export const ghJson = (args) => JSON.parse(gh(args).sortie || 'null');

export const CHAMPS_PR =
  'number,title,url,state,isDraft,baseRefName,headRefName,headRefOid,reviewDecision,statusCheckRollup,author,mergeable';

/** Proposition (PR) d'une branche : 'open' ou 'merged'. */
export function propositionDeLaBranche(branche, etat = 'open') {
  const liste = ghJson(['pr', 'list', '--head', branche, '--state', etat, '--json', CHAMPS_PR, '--limit', '10']);
  return liste?.find((pr) => pr.headRefName === branche) ?? null;
}

/** 'ADMIN', 'MAINTAIN', 'WRITE', 'TRIAGE' ou 'READ'. */
export function permissionSurLeDepot() {
  return ghJson(['repo', 'view', '--json', 'viewerPermission'])?.viewerPermission ?? 'READ';
}

/** Résume les vérifications automatiques (CI) : 'aucune', 'en-cours', 'verte' ou 'rouge'. */
export function etatCI(rollup) {
  const verifications = rollup ?? [];
  if (!verifications.length) return 'aucune';
  let enCours = false;
  for (const v of verifications) {
    const conclusion = String(v.conclusion || v.state || '').toUpperCase();
    const statut = String(v.status ?? '').toUpperCase();
    if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conclusion)) {
      return 'rouge';
    }
    if ((v.__typename === 'CheckRun' && statut !== 'COMPLETED') || ['PENDING', 'EXPECTED'].includes(conclusion)) {
      enCours = true;
    }
  }
  return enCours ? 'en-cours' : 'verte';
}

export const LIBELLE_CI = {
  aucune: 'aucune vérification',
  'en-cours': 'vérifications en cours',
  verte: 'vérifications vertes',
  rouge: 'vérifications ROUGES',
};

export const LIBELLE_RELECTURE = {
  APPROVED: 'acceptée',
  CHANGES_REQUESTED: 'changements demandés',
  REVIEW_REQUIRED: 'en attente de relecture',
  '': 'sans relecture obligatoire',
};

// ---------------------------------------------------------------------------
// État du dépôt
// ---------------------------------------------------------------------------

/** Se place à la racine du projet (là où est le dossier .git). */
export function allerALaRacine() {
  const r = git(['rev-parse', '--show-toplevel'], { autoriserEchec: true });
  if (r.code !== 0) {
    throw new Stop(
      "Ce dossier n'est pas une copie du projet. Lance l'outil depuis le dossier outils du projet Kadastr.",
    );
  }
  process.chdir(r.sortie.trim());
  if (git(['remote', 'get-url', 'origin'], { autoriserEchec: true }).code !== 0) {
    throw new Stop("Ce projet n'est relié à aucun dépôt GitHub (pas de « origin »). Demande à Claude de regarder.");
  }
}

export function brancheActuelle() {
  const branche = gitTexte('branch', '--show-current').trim();
  if (!branche) {
    throw new Stop(
      "Tu n'es sur aucune branche (Git est en « HEAD détachée »). Demande à Claude de te remettre sur dev.",
    );
  }
  return branche;
}

export const estProtegee = (branche) => BRANCHES_PROTEGEES.has(branche);

/** Refuse de continuer si Git est resté au milieu d'une fusion, d'un rebase… */
export function verifierAucuneOperation() {
  const operations = [
    ['MERGE_HEAD', 'une fusion'],
    ['rebase-merge', 'un rebase'],
    ['rebase-apply', 'un rebase'],
    ['CHERRY_PICK_HEAD', 'un cherry-pick'],
    ['REVERT_HEAD', 'un revert'],
  ];
  const chemins = gitTexte('rev-parse', ...operations.flatMap(([fichier]) => ['--git-path', fichier])).split('\n');
  for (const [i, [, quoi]] of operations.entries()) {
    if (existsSync(chemins[i].trim())) {
      throw new Stop(
        `Git est resté au milieu d'une opération (${quoi}). Je ne touche à rien. Demande à Claude : « termine ou annule ${quoi} en cours ».`,
      );
    }
  }
}

const ETATS_FICHIER = {
  '?': 'nouveau',
  A: 'ajouté',
  M: 'modifié',
  T: 'modifié',
  D: 'supprimé',
  R: 'renommé',
  C: 'copié',
};

/** Fichiers modifiés et pas encore enregistrés : [{ etat, chemin }]. */
export function modifications() {
  const morceaux = gitTexte('status', '--porcelain=v1', '-z', '-uall').split('\0');
  const liste = [];
  for (let i = 0; i < morceaux.length; i++) {
    const morceau = morceaux[i];
    if (!morceau) continue;
    const xy = morceau.slice(0, 2);
    const chemin = morceau.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // le nom d'origine suit : on le saute
    const conflit = xy.includes('U') || xy === 'AA' || xy === 'DD';
    liste.push({ etat: conflit ? 'en conflit' : (ETATS_FICHIER[xy.trim()[0]] ?? 'modifié'), chemin });
  }
  return liste;
}

export function afficherFichiers(liste, maximum = 20) {
  for (const { etat, chemin } of liste.slice(0, maximum)) dire.info(`${etat.padEnd(10)} ${chemin}`);
  if (liste.length > maximum) dire.info(`… et ${nombre(liste.length - maximum, 'autre')}`);
}

/** { avance, retard } : commits de a absents de b, et commits de b absents de a. */
export function ecart(a, b) {
  const [avance, retard] = gitTexte('rev-list', '--left-right', '--count', `${a}...${b}`)
    .trim()
    .split(/\s+/)
    .map(Number);
  return { avance, retard };
}

export const existe = (ref) =>
  git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { autoriserEchec: true }).code === 0;

/** Branches de tâches sur ce PC : [{ nom, disparue }] (disparue = supprimée sur GitHub, souvent après fusion). */
export function tachesLocales() {
  return gitTexte('for-each-ref', '--format=%(refname:short)|%(upstream:track)', 'refs/heads/')
    .split('\n')
    .filter(Boolean)
    .map((ligne) => {
      const [nom, suivi] = ligne.split('|');
      return { nom, disparue: suivi === '[gone]' };
    })
    .filter(({ nom }) => !estProtegee(nom));
}

/** Titres des enregistrements entre deux versions (du plus récent au plus ancien). */
export function titresEntre(de, a) {
  return gitTexte('log', '--format=%s', '--no-merges', `${de}..${a}`).split('\n').filter(Boolean);
}

export function afficherListe(titres, maximum = 15) {
  for (const titre of titres.slice(0, maximum)) dire.info(`- ${titre}`);
  if (titres.length > maximum) dire.info(`… et ${nombre(titres.length - maximum, 'autre')}`);
}

/** Récupère les nouveautés de GitHub. `tolerant` : continue hors ligne. */
export function recuperer({ tolerant = false, tags = false } = {}) {
  dire.etape('Je récupère les nouveautés depuis GitHub…');
  const r = git(['fetch', '--prune', ...(tags ? ['--tags'] : []), 'origin'], { autoriserEchec: true });
  if (r.code === 0) return true;
  if (tolerant) {
    dire.attention('GitHub ne répond pas (connexion internet ?).');
    return false;
  }
  throw new Stop(`Impossible de joindre GitHub. Vérifie ta connexion internet, puis relance.\n${gris(r.erreur)}`);
}

/** Envoie la branche sur GitHub. Jamais de force : si GitHub a une version plus récente, on l'intègre d'abord. */
export function pousser(branche) {
  dire.etape("J'envoie sur GitHub…");
  let r = git(['push', '-u', 'origin', branche], { autoriserEchec: true });
  if (r.code !== 0 && /rejected|non-fast-forward|fetch first/i.test(r.erreur)) {
    dire.etape("Ta branche a changé sur GitHub entre-temps : j'intègre cette version d'abord…");
    const tirer = git(['pull', '--no-rebase', '--no-edit', 'origin', branche], { autoriserEchec: true });
    if (tirer.code !== 0) {
      git(['merge', '--abort'], { autoriserEchec: true });
      throw new Stop(
        "Ton travail est bien enregistré sur ce PC, mais ta branche a aussi changé sur GitHub et les deux versions se contredisent (conflit). Rien n'est perdu. Demande à Claude : « intègre la version GitHub de ma branche et règle les conflits ».",
      );
    }
    r = git(['push', '-u', 'origin', branche], { autoriserEchec: true });
  }
  if (r.code !== 0) {
    if (/\b403\b|denied|permission/i.test(r.erreur)) {
      throw new Stop(
        `GitHub refuse l'envoi : tu n'as pas (encore) le droit d'écrire sur le dépôt. Vérifie que tu as accepté l'invitation, puis relance ${nomOutil('installer')}.`,
      );
    }
    throw new Stop(`L'envoi vers GitHub a échoué :\n${r.erreur}`);
  }
}

/**
 * Supprime de ce PC les branches de tâches déjà fusionnées sur GitHub.
 * Sécurité : seulement si la branche locale est exactement ce qui a été fusionné (rien ne peut être perdu).
 */
export function nettoyerTachesFusionnees({ aussi = [] } = {}) {
  const resultat = { supprimees: [], gardees: [] };
  const candidates = new Set([
    ...tachesLocales()
      .filter((t) => t.disparue)
      .map((t) => t.nom),
    ...aussi.filter((b) => !estProtegee(b) && existe(`refs/heads/${b}`)),
  ]);
  if (!candidates.size || !githubDisponible()) return resultat;
  let actuelle = gitTexte('branch', '--show-current').trim();
  for (const branche of candidates) {
    const pr = propositionDeLaBranche(branche, 'merged');
    if (!pr || pr.headRefOid !== gitTexte('rev-parse', branche).trim()) {
      resultat.gardees.push(branche);
      continue;
    }
    if (branche === actuelle) {
      if (modifications().length) {
        dire.attention(
          `Ta tâche ${branche} a été fusionnée, mais tu as des modifications non enregistrées dessus. Demande à Claude : « déplace mes modifications sur une nouvelle tâche ».`,
        );
        resultat.gardees.push(branche);
        continue;
      }
      git(['switch', 'dev']);
      git(['merge', '--ff-only', 'origin/dev'], { autoriserEchec: true });
      actuelle = 'dev';
      dire.info('Je te remets sur dev.');
    }
    if (git(['branch', '-D', branche], { autoriserEchec: true }).code === 0) {
      resultat.supprimees.push({ branche, pr: pr.number });
    } else {
      resultat.gardees.push(branche);
    }
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Noms de branches et messages d'enregistrement
// ---------------------------------------------------------------------------

const MOTS_VIDES = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'd',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'par',
  'pour',
  'sur',
  'un',
  'une',
]);

/** « Achat de territoire » → « achat-territoire » (sans accents, 40 caractères au plus). */
export function slug(texte) {
  const mots = String(texte)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const utiles = mots.filter((m) => !MOTS_VIDES.has(m));
  const choisis = utiles.length ? utiles : mots;
  let resultat = '';
  for (const mot of choisis) {
    const suivant = resultat ? `${resultat}-${mot}` : mot;
    if (suivant.length > 40) break;
    resultat = suivant;
  }
  return resultat || (choisis[0] ?? '').slice(0, 40);
}

export const nomBranche = (type, zone, sujet) => `${type}/${zone}-${slug(sujet)}`;

/** Type et zone d'une branche « feat/api-achat-territoire » → { type: 'feat', zone: 'api', sujet: 'achat territoire' }. */
export function lireBranche(branche) {
  const m = /^(feat|fix)\/([a-z]+)-(.+)$/.exec(branche);
  if (!m || !ZONES[m[2]]) return { type: null, zone: null, sujet: branche.replace(/^[^/]*\//, '').replace(/-/g, ' ') };
  return { type: m[1], zone: m[2], sujet: m[3].replace(/-/g, ' ') };
}

const FORMAT_CONVENTIONNEL = new RegExp(`^(${TYPES_COMMIT.join('|')})(\\([a-z0-9-]+\\))?!?: \\S`);

/**
 * Message au format Conventional Commits à partir d'une phrase en clair.
 * Sur feat/api-… : « Ajout du bouton » → « feat(api): ajout du bouton ». Docs et CI : « docs: … », « ci: … ».
 */
export function messageCommit(branche, texte, { type, zone } = {}) {
  const phrase = String(texte).trim().replace(/\s+/g, ' ').replace(/\.+$/, '');
  if (FORMAT_CONVENTIONNEL.test(phrase)) return phrase;
  const lu = lireBranche(branche);
  let leType = type ?? lu.type ?? 'chore';
  let laZone = zone ?? lu.zone;
  if (!type && (laZone === 'docs' || laZone === 'ci')) {
    leType = laZone;
    laZone = null;
  }
  // Minuscule au début, sauf pour un sigle (« OPA », « API »).
  const description = /^\p{Lu}\p{Ll}/u.test(phrase) ? phrase[0].toLowerCase() + phrase.slice(1) : phrase;
  return `${leType}${laZone ? `(${laZone})` : ''}: ${description}`;
}

// ---------------------------------------------------------------------------
// Fichiers à ne jamais envoyer
// ---------------------------------------------------------------------------

export function fichiersRefuses(liste, tailleMaxMo = Number(process.env.DUO_TAILLE_MAX_MO ?? 10)) {
  const refuses = [];
  for (const { etat, chemin } of liste) {
    if (etat === 'supprimé') continue;
    const nom = chemin.replace(/\\/g, '/');
    const secret =
      (/(^|\/)\.env(\..+)?$/i.test(nom) && !/(^|\/)\.env\.example$/i.test(nom)) ||
      /\.(sqlite3?|db|pem|key|p12|pfx)$/i.test(nom) ||
      /(^|\/)id_(rsa|ed25519|ecdsa)$/i.test(nom);
    if (secret) {
      refuses.push({ chemin, raison: 'secret ou base de données (jamais dans Git)' });
      continue;
    }
    try {
      const taille = statSync(chemin).size;
      if (taille > tailleMaxMo * 1024 * 1024) {
        refuses.push({
          chemin,
          raison: `trop gros (${Math.round(taille / 1024 / 1024)} Mo, maximum ${tailleMaxMo} Mo)`,
        });
      }
    } catch {
      // fichier illisible ou dossier : Git s'en chargera
    }
  }
  return refuses;
}

// ---------------------------------------------------------------------------
// Texte des propositions (PR)
// ---------------------------------------------------------------------------

/** Remplit le modèle .github/pull_request_template.md. */
export function corpsProposition({ quoi, pourquoi, titres }) {
  let modele;
  try {
    modele = readFileSync('.github/pull_request_template.md', 'utf8');
  } catch {
    modele = '## Quoi\n\n<!-- -->\n\n## Pourquoi\n\n<!-- -->\n';
  }
  const liste = titres.length > 1 ? `\n\nEnregistrements :\n${titres.map((t) => `- ${t}`).join('\n')}` : '';
  let corps = modele.replace(/(## Quoi[ \t]*\r?\n)\s*<!--[\s\S]*?-->/, (_, debut) => `${debut}\n${quoi}${liste}`);
  if (pourquoi) {
    corps = corps.replace(/(## Pourquoi[ \t]*\r?\n)\s*<!--[\s\S]*?-->/, (_, debut) => `${debut}\n${pourquoi}`);
  }
  return corps;
}
