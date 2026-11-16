// « Fin d'étape » : en deux passages.
// 1er passage : ouvre la proposition dev → main avec la liste de ce qui a changé.
// 2e passage (vérifications vertes) : fusionne dans main (merge commit) et crée la version v0.<étape>.0.

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

export async function finDEtape(options) {
  dire.titre("Fin d'étape");
  allerALaRacine();
  exigerGitHub();
  recuperer({ tags: true });

  const ouverte = (ghJson(['pr', 'list', '--base', 'main', '--head', 'dev', '--state', 'open', '--json', CHAMPS_PR]) ??
    [])[0];
  if (ouverte) return publier(ouverte, options);

  const contenu = titresEntre('origin/main', 'origin/dev');
  if (!contenu.length) {
    const enAttente = etapeFusionneeSansVersion();
    if (enAttente) {
      dire.info(`L'étape ${enAttente} est fusionnée dans main, mais sa version n'a pas été créée.`);
      return creerVersion(enAttente, options);
    }
    dire.ok('Rien de nouveau dans dev depuis la dernière version : rien à faire.');
    return;
  }

  const derniere = derniereEtape();
  const etape = Number.parseInt(
    options.etape ??
      (await demander("Numéro de l'étape qui se termine", { defaut: String(derniere + 1), facultatif: true })),
    10,
  );
  if (!(etape > 0)) throw new Stop("Numéro d'étape non compris.", 2);
  const version = `v0.${etape}.0`;
  if (versionExiste(version))
    throw new Stop(`La version ${version} existe déjà. Choisis un autre numéro (--etape).`, 2);

  dire.info(`Contenu de l'étape ${etape} (${nombre(contenu.length, 'changement')}) :`);
  afficherListe(contenu, 30);

  const titre = `chore(release): étape ${etape} (${version})`;
  const corps = [
    `## Fin de l'étape ${etape}`,
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
  dire.ok(`Proposition de fin d'étape créée : ${gras(titre)}`);
  dire.info(url);
  dire.suite(
    `quand les vérifications sont vertes (quelques minutes), relance ${nomOutil('fin-d-etape')} : je fusionnerai dans main et je créerai la version ${version}.`,
  );
}

async function publier(pr, options) {
  dire.info("Une proposition de fin d'étape est ouverte :");
  const lu = numeroDansTitre(pr.title);
  const etape =
    lu || Number.parseInt(options.etape ?? (await demander("Numéro de l'étape", { option: '--etape <n>' })), 10);
  if (!(etape > 0)) throw new Stop("Numéro d'étape non compris.", 2);
  if (options.essai) {
    dire.info(`n°${pr.number} ${gras(pr.title)}`);
    dire.ok(`[essai] Je fusionnerais dans main puis je créerais la version v0.${etape}.0. Rien n'a été fait.`);
    return;
  }
  if (await fusionnerProposition(pr, options)) await creerVersion(etape, options);
}

async function creerVersion(etape, options) {
  const version = `v0.${etape}.0`;
  if (options.essai) {
    dire.ok(`[essai] Je créerais la version ${version} sur main. Rien n'a été fait.`);
    return;
  }
  dire.etape(`Je crée la version ${version}…`);
  const r = gh(['release', 'create', version, '--target', 'main', '--title', `Étape ${etape}`, '--generate-notes']);
  dire.ok(`Version ${gras(version)} créée.`);
  dire.info(r.sortie.split('\n').find((ligne) => ligne.startsWith('http')) ?? '');
  dire.suite(`bravo ! Pour l'étape suivante, chacun repart avec ${nomOutil('mettre-a-jour')}.`);
}

function derniereEtape() {
  const tags = gitTexte('tag', '--list', 'v0.*.0', '--sort=-v:refname').split('\n').filter(Boolean);
  return Number.parseInt(/^v0\.(\d+)\.0$/.exec(tags[0] ?? '')?.[1] ?? '0', 10);
}

function versionExiste(version) {
  return git(['rev-parse', '--verify', '--quiet', `refs/tags/${version}`], { autoriserEchec: true }).code === 0;
}

/** Numéro de l'étape si la dernière proposition dev → main est fusionnée sans version, sinon null. */
function etapeFusionneeSansVersion() {
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
  const etape = numeroDansTitre(derniere.title);
  if (!etape || versionExiste(`v0.${etape}.0`)) return null;
  return etape;
}

/** Numéro d'étape lu dans un titre « chore(release): étape 3 (v0.3.0) » (accent facultatif), sinon NaN. */
export function numeroDansTitre(titre) {
  return Number.parseInt(/[ée]tape (\d+)/i.exec(titre ?? '')?.[1] ?? '', 10);
}
