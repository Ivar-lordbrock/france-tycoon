// « Proposer mon travail » : ouvre une proposition (pull request) de la tâche vers dev,
// remplie avec le modèle .github/pull_request_template.md.

import {
  allerALaRacine,
  brancheActuelle,
  corpsProposition,
  demander,
  dire,
  ecart,
  estProtegee,
  etatCI,
  exigerGitHub,
  existe,
  gh,
  gras,
  LIBELLE_CI,
  lireBranche,
  messageCommit,
  modifications,
  nomOutil,
  pousser,
  propositionDeLaBranche,
  recuperer,
  Stop,
  titresEntre,
  verifierAucuneOperation,
} from '../commun.mjs';

export async function proposer(options) {
  dire.titre('Proposer mon travail');
  allerALaRacine();
  verifierAucuneOperation();
  const branche = brancheActuelle();
  if (estProtegee(branche)) {
    throw new Stop(
      `Tu es sur ${branche} : il n'y a rien à proposer d'ici. Une proposition part toujours d'une tâche (${nomOutil('commencer')}).`,
    );
  }
  exigerGitHub();
  if (modifications().length) {
    throw new Stop(`Tu as des modifications pas encore envoyées. Lance d'abord ${nomOutil('envoyer')}, puis relance.`);
  }
  recuperer();

  const base = options.base ?? 'dev';
  if (!existe(`refs/remotes/origin/${base}`)) throw new Stop(`La branche ${base} n'existe pas sur GitHub.`, 2);
  const titres = titresEntre(`origin/${base}`, 'HEAD');
  if (!titres.length) {
    throw new Stop(`Ta tâche ne contient encore aucun changement par rapport à ${base} : rien à proposer.`);
  }

  // Envoyer d'abord ce qui ne l'est pas encore.
  const distante = `origin/${branche}`;
  if (!existe(`refs/remotes/${distante}`) || ecart('HEAD', distante).avance > 0) pousser(branche);

  const existante = propositionDeLaBranche(branche);
  if (existante) {
    dire.ok(`Ta proposition existe déjà : n°${existante.number} ${gras(existante.title)}`);
    dire.info(existante.url);
    dire.info(`État : ${LIBELLE_CI[etatCI(existante.statusCheckRollup)]}.`);
    dire.suite(`tes prochains envois s'y ajouteront tout seuls. Pour suivre : ${nomOutil('etat')}.`);
    return;
  }

  const { sujet } = lireBranche(branche);
  const titreParDefaut = titres.length === 1 ? titres[0] : messageCommit(branche, sujet);
  const titre = messageCommit(
    branche,
    options.titre ?? (await demander('Titre de ta proposition', { defaut: titreParDefaut, facultatif: true })),
  );
  const quoiParDefaut =
    titres.length === 1
      ? titres[0].replace(/^[a-z]+(\([a-z0-9-]+\))?!?: /, '')
      : 'Voir les enregistrements ci-dessous.';
  const quoi =
    options.quoi ??
    (await demander('En une ou deux phrases, que fait ce travail ?', { defaut: quoiParDefaut, facultatif: true }));
  const pourquoi =
    options.pourquoi ??
    (await demander('Pourquoi ? (étape, besoin… Entrée pour passer)', { defaut: '', facultatif: true }));

  const args = ['pr', 'create', '--base', base, '--head', branche, '--title', titre, '--body-file', '-'];
  if (options.brouillon) args.push('--draft');
  dire.etape('Je crée la proposition sur GitHub…');
  const r = gh(args, { entree: corpsProposition({ quoi, pourquoi, titres }) });
  const url = r.sortie.split('\n').find((ligne) => ligne.startsWith('http')) ?? r.sortie;

  dire.ok(`Proposition créée${options.brouillon ? ' (brouillon)' : ''} : ${gras(titre)}`);
  dire.info(url);
  dire.suite(
    `les vérifications automatiques (CI) tournent quelques minutes, puis ton binôme relit. Pour suivre : ${nomOutil('etat')}.`,
  );
}
