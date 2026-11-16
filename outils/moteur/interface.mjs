// Fenêtre des outils : un petit serveur web sur ce PC seulement (127.0.0.1) et la page interface.html.
// Chaque bouton lance le moteur (duo.mjs) en « mode interface » : ses messages et ses questions arrivent
// en lignes « @@{json} », les réponses repartent par son entrée standard. Mêmes garde-fous qu'au clavier.
//
// Sécurité : écoute seulement 127.0.0.1, jeton secret tiré au hasard exigé partout, en-tête Host vérifié
// (contre le « DNS rebinding »), aucune action en dehors de la liste ci-dessous.

import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allerALaRacine, git, OUTILS, Stop, TYPES, ZONES } from './commun.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DUO = path.join(ICI, 'duo.mjs');
const PAGE = path.join(ICI, 'interface.html');

/** Actions que la page peut lancer, et options qu'elle peut leur passer (avec leur forme permise). */
const ACTIONS = new Set(['mettre-a-jour', 'commencer', 'envoyer', 'proposer', 'fusionner', 'fin-de-sprint']);
const OPTIONS = {
  reprendre: /^[\w][\w./-]{0,100}$/,
  pr: /^\d{1,7}$/,
  essai: true,
};

const TICK_MS = 5000;
// Plus de signe de la page depuis 3 min : on s'arrête. Pas moins : une fenêtre réduite longtemps
// ne donne signe de vie qu'une fois par minute (le navigateur économise l'énergie).
const TICKS_SANS_PAGE = 36;
const TICKS_AVANT_PAGE = 36; // la page n'est jamais venue (3 min) : on s'arrête
const TICKS_APRES_AU_REVOIR = 2; // la page a dit « au revoir » (fenêtre fermée) : on s'arrête 10 s après

export async function ouvrirInterface(options) {
  let racine;
  let fichierVerrou;
  let serveur;
  let url;
  try {
    allerALaRacine();
    racine = process.cwd();
    fichierVerrou = path.resolve(git(['rev-parse', '--git-path', 'duo-interface.json']).sortie.trim());

    // Déjà ouverte ? On remontre la même fenêtre au lieu d'en lancer une deuxième.
    if (!options.port && !options['sans-navigateur']) {
      const deja = await interfaceDejaOuverte(fichierVerrou);
      if (deja) {
        ouvrirFenetre(deja);
        console.log('Les outils étaient déjà ouverts : je remets la fenêtre devant.');
        return;
      }
    }

    const jeton = options.jeton ?? randomBytes(18).toString('hex');
    if (!/^[\w-]{8,100}$/.test(jeton)) throw new Stop('Jeton trop court (8 caractères au moins).', 2);
    serveur = new Serveur({ racine, jeton, depot: adresseDuDepot() });
    const port = await serveur.ecouter(Number(options.port ?? 0));
    url = `http://127.0.0.1:${port}/?jeton=${jeton}`;
  } catch (erreur) {
    // La console est réduite : sans cette boîte de dialogue, l'erreur passerait inaperçue.
    if (!options['sans-navigateur']) montrerErreur(erreur?.message ?? String(erreur));
    throw erreur;
  }

  writeFileSync(fichierVerrou, JSON.stringify({ url, pid: process.pid }));
  const nettoyer = () => rmSync(fichierVerrou, { force: true });
  process.on('exit', nettoyer);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => process.exit(0));
  }

  console.log('\nFrance Tycoon - outils');
  console.log(`Adresse : ${url}`);
  console.log('Cette fenêtre-ci fait tourner les outils : elle se fermera toute seule avec la page.\n');
  if (!options['sans-navigateur']) ouvrirFenetre(url);
  serveur.surveiller({ attendreLaPage: !options['sans-navigateur'] });
  await serveur.fin;
  setTimeout(() => process.exit(0), 300).unref();
}

/** Adresse web du dépôt GitHub (pour le lien « Voir sur GitHub »), ou ''. */
function adresseDuDepot() {
  const brut = git(['remote', 'get-url', 'origin'], { autoriserEchec: true }).sortie.trim();
  const m = /github\.com[:/](.+?)(\.git)?$/.exec(brut);
  return m ? `https://github.com/${m[1]}` : '';
}

async function interfaceDejaOuverte(fichierVerrou) {
  try {
    const { url } = JSON.parse(readFileSync(fichierVerrou, 'utf8'));
    const adresse = new URL(url);
    const r = await fetch(`${adresse.origin}/api/ping`, {
      headers: { 'x-jeton': adresse.searchParams.get('jeton') ?? '' },
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? url : null;
  } catch {
    return null;
  }
}

/** Ouvre la page dans une fenêtre d'application (Edge ou Chrome), sinon dans le navigateur par défaut. */
export function ouvrirFenetre(url) {
  const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidats = bases.flatMap((base) => [
    path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]);
  const exe = candidats.find(existsSync);
  const detache = { detached: true, stdio: 'ignore', windowsHide: true };
  if (exe) {
    spawn(exe, [`--app=${url}`, '--window-size=1200,880'], detache).unref();
  } else if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', `"${url}"`], { ...detache, windowsVerbatimArguments: true }).unref();
  } else {
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], detache).unref();
  }
}

/** Montre une erreur bloquante dans une boîte de dialogue Windows (la console est réduite). */
export function montrerErreur(message) {
  if (process.platform !== 'win32') return;
  spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:DUO_MESSAGE, 'France Tycoon - outils')",
    ],
    { env: { ...process.env, DUO_MESSAGE: message }, stdio: 'ignore', windowsHide: true },
  ).on('error', () => {});
}

// ---------------------------------------------------------------------------

class Serveur {
  constructor({ racine, jeton, depot }) {
    this.racine = racine;
    this.jeton = Buffer.from(jeton);
    this.depot = depot;
    this.execution = null; // action en cours ou dernière action
    this.compteur = 0;
    this.etatEnCours = null; // promesse du « Où j'en suis » en cours
    this.ticks = 0;
    this.pageVue = false;
    this.fin = new Promise((resoudre) => {
      this.terminer = resoudre;
    });
    this.http = createServer((req, res) => {
      this.repondre(req, res).catch((erreur) => envoyerJson(res, 500, { erreur: String(erreur?.message ?? erreur) }));
    });
  }

  ecouter(port) {
    return new Promise((resoudre, rejeter) => {
      this.http.once('error', rejeter);
      this.http.listen(port, '127.0.0.1', () => {
        this.port = this.http.address().port;
        resoudre(this.port);
      });
    });
  }

  /** S'arrête tout seul quand la page ne donne plus signe de vie (fenêtre fermée). */
  surveiller({ attendreLaPage }) {
    const minuterie = setInterval(() => {
      if (this.actionEnCours()) {
        this.ticks = 0;
        return;
      }
      this.ticks += 1;
      const limite = this.pageVue ? TICKS_SANS_PAGE : attendreLaPage ? TICKS_AVANT_PAGE : Number.POSITIVE_INFINITY;
      if (this.ticks >= limite) {
        clearInterval(minuterie);
        console.log('La page est fermée : les outils s’arrêtent.');
        this.http.close();
        this.http.closeAllConnections?.();
        this.terminer();
      }
    }, TICK_MS);
    minuterie.unref?.();
    this.http.on('close', () => clearInterval(minuterie));
  }

  actionEnCours() {
    return Boolean(this.execution && !this.execution.fini);
  }

  jetonValide(texte) {
    const recu = Buffer.from(String(texte ?? ''));
    return recu.length === this.jeton.length && timingSafeEqual(recu, this.jeton);
  }

  async repondre(req, res) {
    const hotesPermis = [`127.0.0.1:${this.port}`, `localhost:${this.port}`];
    if (!hotesPermis.includes(req.headers.host ?? '')) return envoyerTexte(res, 403, 'Interdit.');
    const origine = req.headers.origin;
    if (origine && !hotesPermis.some((h) => origine === `http://${h}`)) return envoyerTexte(res, 403, 'Interdit.');

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const jeton = req.headers['x-jeton'] ?? url.searchParams.get('jeton');
    if (!this.jetonValide(jeton)) {
      return envoyerTexte(
        res,
        403,
        'Cette page a expiré. Rouvre les outils : double-clic sur « France Tycoon » sur le Bureau (ou sur 0-ouvrir-les-outils, dans le dossier outils du projet).',
      );
    }
    this.pageVue = true;
    const route = `${req.method} ${url.pathname}`;
    if (route === 'POST /api/au-revoir') {
      // Fenêtre fermée… ou simplement rechargée : si la page revient d'ici là, on continue.
      this.ticks = Math.max(this.ticks, TICKS_SANS_PAGE - TICKS_APRES_AU_REVOIR);
      req.resume();
      return envoyerJson(res, 200, { ok: true });
    }
    this.ticks = 0;

    switch (route) {
      case 'GET /':
        return this.envoyerPage(res);
      case 'GET /api/ping':
        return envoyerJson(res, 200, { ok: true });
      case 'GET /api/etat':
        return this.envoyerEtat(res);
      case 'GET /api/flux':
        return this.diffuser(req, res, url);
      case 'POST /api/vivant':
        return envoyerJson(res, 200, { ok: true });
      case 'POST /api/action':
        return this.lancerAction(res, await lireJson(req));
      case 'POST /api/repondre':
        return this.transmettreReponse(res, await lireJson(req));
      case 'POST /api/annuler':
        return this.annuler(res, await lireJson(req));
      case 'POST /api/ouvrir':
        return this.ouvrir(res, await lireJson(req));
      default:
        return envoyerTexte(res, 404, 'Introuvable.');
    }
  }

  envoyerPage(res) {
    const config = {
      outils: Object.fromEntries(Object.entries(OUTILS).map(([action, noms]) => [action, noms[2]])),
      types: TYPES,
      zones: ZONES,
      depot: this.depot,
      dossier: this.racine,
    };
    const html = readFileSync(PAGE, 'utf8').replace('/*CONFIG*/null', JSON.stringify(config).replace(/</g, '\\u003c'));
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
    });
    res.end(html);
  }

  /** « Où j'en suis » en JSON. Une seule lecture à la fois, et jamais pendant une action (Git n'aime pas). */
  async envoyerEtat(res) {
    if (this.actionEnCours()) return envoyerJson(res, 409, { occupe: true });
    this.etatEnCours ??= this.lireEtat().finally(() => {
      this.etatEnCours = null;
    });
    return envoyerJson(res, 200, await this.etatEnCours);
  }

  lireEtat() {
    return new Promise((resoudre) => {
      const enfant = this.lancerMoteur(['etat', '--json']);
      let sortie = '';
      enfant.stdout.on('data', (morceau) => {
        sortie += morceau;
      });
      enfant.stderr.on('data', (morceau) => {
        sortie += morceau;
      });
      enfant.on('error', (erreur) => resoudre({ erreur: erreur.message }));
      enfant.on('close', () => {
        const lignes = sortie.split(/\r?\n/).filter(Boolean);
        const stop = lignes.find((l) => l.startsWith('@@'));
        try {
          if (stop) resoudre({ erreur: JSON.parse(stop.slice(2)).texte });
          else resoudre({ etat: JSON.parse(lignes.at(-1) ?? 'null') });
        } catch {
          resoudre({ erreur: sortie.trim() || 'Réponse illisible du moteur.' });
        }
      });
    });
  }

  lancerMoteur(args) {
    return spawn(process.execPath, [DUO, ...args], {
      cwd: this.racine,
      env: { ...process.env, DUO_INTERFACE: '1', NO_COLOR: '1', CLAUDECODE: '' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  async lancerAction(res, corps) {
    const action = String(corps?.action ?? '');
    if (!ACTIONS.has(action)) return envoyerJson(res, 400, { erreur: `Action inconnue : ${action}` });
    if (this.actionEnCours()) return envoyerJson(res, 409, { erreur: 'Une action est déjà en cours.' });

    const args = [action];
    for (const [nom, valeur] of Object.entries(corps?.options ?? {})) {
      const regle = OPTIONS[nom];
      if (!regle) return envoyerJson(res, 400, { erreur: `Option refusée : ${nom}` });
      if (regle === true) {
        if (valeur === true) args.push(`--${nom}`);
      } else if (regle.test(String(valeur))) {
        args.push(`--${nom}=${valeur}`);
      } else {
        return envoyerJson(res, 400, { erreur: `Valeur refusée pour ${nom}.` });
      }
    }

    // Attendre la fin d'un « Où j'en suis » en cours (deux Git en même temps se gênent).
    if (this.etatEnCours) await this.etatEnCours.catch(() => {});

    const execution = {
      id: String(++this.compteur),
      action,
      evenements: [],
      abonnes: new Set(),
      fini: false,
      code: null,
    };
    const enfant = this.lancerMoteur(args);
    execution.enfant = enfant;
    this.execution = execution;

    const pousser = (evenement) => {
      execution.evenements.push(evenement);
      const n = execution.evenements.length - 1;
      for (const abonne of execution.abonnes) ecrireEvenement(abonne, n, evenement);
    };
    const lire = (flux) => {
      let reste = '';
      flux.setEncoding('utf8');
      flux.on('data', (morceau) => {
        reste += morceau;
        const lignes = reste.split(/\r?\n/);
        reste = lignes.pop() ?? '';
        for (const ligne of lignes) pousser(analyserLigne(ligne));
      });
      flux.on('end', () => {
        if (reste) pousser(analyserLigne(reste));
      });
    };
    lire(enfant.stdout);
    lire(enfant.stderr);
    enfant.stdin.on('error', () => {});
    enfant.on('error', (erreur) => pousser({ genre: 'erreur', texte: erreur.message }));
    enfant.on('close', (code) => {
      execution.fini = true;
      execution.code = code ?? 3;
      pousser({ genre: 'fin', code: execution.code });
      for (const abonne of execution.abonnes) abonne.end();
      execution.abonnes.clear();
    });

    return envoyerJson(res, 200, { id: execution.id });
  }

  /** Flux des messages de l'action (Server-Sent Events), en reprenant là où la page s'était arrêtée. */
  diffuser(req, res, url) {
    const execution = this.execution;
    if (!execution || execution.id !== url.searchParams.get('id')) return envoyerTexte(res, 404, 'Action inconnue.');
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    const depuis = Number(req.headers['last-event-id'] ?? -1) + 1;
    execution.evenements.slice(depuis).forEach((evenement, i) => {
      ecrireEvenement(res, depuis + i, evenement);
    });
    if (execution.fini) return res.end();
    execution.abonnes.add(res);
    req.on('close', () => execution.abonnes.delete(res));
  }

  transmettreReponse(res, corps) {
    const execution = this.execution;
    if (!execution || execution.fini || execution.id !== String(corps?.id)) {
      return envoyerJson(res, 409, { erreur: 'Aucune question en attente.' });
    }
    const reponse = String(corps?.reponse ?? '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 2000);
    execution.enfant.stdin.write(`${reponse}\n`);
    return envoyerJson(res, 200, { ok: true });
  }

  annuler(res, corps) {
    const execution = this.execution;
    if (execution && !execution.fini && execution.id === String(corps?.id)) execution.enfant.stdin.end();
    return envoyerJson(res, 200, { ok: true });
  }

  ouvrir(res, corps) {
    const detache = { detached: true, stdio: 'ignore', windowsHide: true };
    switch (corps?.quoi) {
      case 'dossier':
        if (process.platform === 'win32') spawn('explorer.exe', [this.racine], detache).unref();
        else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [this.racine], detache).unref();
        break;
      case 'installer': {
        const bat = path.join(this.racine, 'outils', '1-installer-mon-poste.bat');
        if (process.platform !== 'win32' || !existsSync(bat)) {
          return envoyerJson(res, 400, { erreur: 'Installateur introuvable.' });
        }
        spawn('cmd.exe', ['/c', 'start', '"France Tycoon - installation"', `"${bat}"`], {
          ...detache,
          windowsHide: false,
          windowsVerbatimArguments: true,
        }).unref();
        break;
      }
      default:
        return envoyerJson(res, 400, { erreur: 'Rien à ouvrir.' });
    }
    return envoyerJson(res, 200, { ok: true });
  }
}

/** Une ligne du moteur : « @@{json} » (message, question, stop) ou texte brut. */
function analyserLigne(ligne) {
  if (ligne.startsWith('@@')) {
    try {
      return JSON.parse(ligne.slice(2));
    } catch {
      // ligne abîmée : on la montre telle quelle
    }
  }
  return { genre: 'brut', texte: ligne };
}

function ecrireEvenement(res, n, evenement) {
  res.write(`id: ${n}\ndata: ${JSON.stringify(evenement)}\n\n`);
}

function envoyerJson(res, statut, donnees) {
  res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(donnees));
}

function envoyerTexte(res, statut, texte) {
  res.writeHead(statut, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(texte);
}

function lireJson(req) {
  return new Promise((resoudre, rejeter) => {
    let corps = '';
    req.setEncoding('utf8');
    req.on('data', (morceau) => {
      corps += morceau;
      if (corps.length > 65536) {
        rejeter(new Stop('Requête trop grosse.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resoudre(corps ? JSON.parse(corps) : {});
      } catch {
        resoudre({});
      }
    });
    req.on('error', rejeter);
  });
}
