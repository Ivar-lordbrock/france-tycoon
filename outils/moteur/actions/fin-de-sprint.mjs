// « Fin de sprint » : en deux passages.
// 1er passage : ouvre la proposition dev → main avec la liste de ce qui a changé.
// 2e passage (vérifications vertes) : fusionne dans main (merge commit) et crée la version v0.<sprint>.0.

import {
  afficherListe,
  allerALaRacine,
  CHAMPS_PR,
  demander,
  dire,
  exigerGitHub,
  gh,
  ghJson,
  git,
  gitTexte,
  gras,
  nombre,
  nomOutil,
  recuperer,
  Stop,
  titresEntre,
} from '../commun.mjs';
import { fusionnerProposition } from './fusionner.mjs';

export async function finDeSprint(options) {
  dire.titre('Fin de sprint');
  allerALaRacine();
  exigerGitHub();
  recuperer({ tags: true });

  const ouverte = (ghJson(['pr', 'list', '--base', 'main', '--head', 'dev', '--state', 'open', '--json', CHAMPS_PR]) ??
    [])[0];
  if (ouverte) return publier(ouverte, options);

  const contenu = titresEntre('origin/main', 'origin/dev');
  if (!contenu.length) {
    const enAttente = sprintFusionneSansVersion();
    if (enAttente) {
      dire.info(`Le sprint ${enAttente} est fusionné dans main, mais sa version n'a pas été créée.`);
      return creerVersion(enAttente, options);
    }
    dire.ok('Rien de nouveau dans dev depuis la dernière version : rien à faire.');
    return;
  }

  const derniere = dernierSprint();
  const sprint = Number.parseInt(
    options.sprint ??
      (await demander('Numéro du sprint qui se termine', { defaut: String(derniere + 1), facultatif: true })),
    10,
  );
  if (!(sprint > 0)) throw new Stop('Numéro de sprint non compris.', 2);
  const version = `v0.${sprint}.0`;
  if (versionExiste(version)) throw new Stop(`La version ${version} existe déjà. Choisis un autre numéro (--sprint).`, 2);

  dire.info(`Contenu du sprint ${sprint} (${nombre(contenu.length, 'changement')}) :`);
  afficherListe(contenu, 30);

  const titre = `chore(release): sprint ${sprint} (${version})`;
  const corps = [
    `## Fin du sprint ${sprint}`,
    '',
    `Fusionne \`dev\` dans \`main\`, puis crée la version **${version}**.`,
    '',
    '## Contenu',
    '',
    ...contenu.map((t) => `- ${t}`),
    '',
  ].join('\n');

  if (options.essai) {
    dire.ok(`[essai] Je créerais la proposition « ${titre} » (dev → main). Rien n'a été fait.`);
    return;
  }
  const r = gh(['pr', 'create', '--base', 'main', '--head', 'dev', '--title', titre, '--body-file', '-'], {
    entree: corps,
  });
  const url = r.sortie.split('\n').find((ligne) => ligne.startsWith('http')) ?? r.sortie;
  dire.ok(`Proposition de fin de sprint créée : ${gras(titre)}`);
  dire.info(url);
  dire.suite(
    `quand les vérifications sont vertes (quelques minutes), relance ${nomOutil('fin-de-sprint')} : je fusionnerai dans main et je créerai la version ${version}.`,
  );
}

async function publier(pr, options) {
  dire.info('Une proposition de fin de sprint est ouverte :');
  const lu = Number.parseInt(/sprint (\d+)/i.exec(pr.title)?.[1] ?? '', 10);
  const sprint =
    lu || Number.parseInt(options.sprint ?? (await demander('Numéro du sprint', { option: '--sprint <n>' })), 10);
  if (!(sprint > 0)) throw new Stop('Numéro de sprint non compris.', 2);
  if (options.essai) {
    dire.info(`n°${pr.number} ${gras(pr.title)}`);
    dire.ok(`[essai] Je fusionnerais dans main puis je créerais la version v0.${sprint}.0. Rien n'a été fait.`);
    return;
  }
  if (await fusionnerProposition(pr, options)) await creerVersion(sprint, options);
}

async function creerVersion(sprint, options) {
  const version = `v0.${sprint}.0`;
  if (options.essai) {
    dire.ok(`[essai] Je créerais la version ${version} sur main. Rien n'a été fait.`);
    return;
  }
  dire.etape(`Je crée la version ${version}…`);
  const r = gh(['release', 'create', version, '--target', 'main', '--title', `Sprint ${sprint}`, '--generate-notes']);
  dire.ok(`Version ${gras(version)} créée.`);
  dire.info(r.sortie.split('\n').find((ligne) => ligne.startsWith('http')) ?? '');
  dire.suite(`bravo ! Pour le sprint suivant, chacun repart avec ${nomOutil('mettre-a-jour')}.`);
}

function dernierSprint() {
  const tags = gitTexte('tag', '--list', 'v0.*.0', '--sort=-v:refname').split('\n').filter(Boolean);
  return Number.parseInt(/^v0\.(\d+)\.0$/.exec(tags[0] ?? '')?.[1] ?? '0', 10);
}

function versionExiste(version) {
  return git(['rev-parse', '--verify', '--quiet', `refs/tags/${version}`], { autoriserEchec: true }).code === 0;
}

/** Numéro du sprint si la dernière proposition dev → main est fusionnée sans version, sinon null. */
function sprintFusionneSansVersion() {
  const derniere = (ghJson([
    'pr',
    'list',
    '--base',
    'main',
    '--head',
    'dev',
    '--state',
    'merged',
    '--limit',
    '1',
    '--json',
    'number,title,mergeCommit',
  ]) ?? [])[0];
  if (!derniere?.mergeCommit?.oid) return null;
  const sprint = Number.parseInt(/sprint (\d+)/i.exec(derniere.title)?.[1] ?? '', 10);
  if (!sprint || versionExiste(`v0.${sprint}.0`)) return null;
  return sprint;
}
