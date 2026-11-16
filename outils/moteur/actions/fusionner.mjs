// « Fusionner » : fusionne une proposition dans dev (squash) ou dans main (merge commit).
// Seulement si les vérifications sont vertes. Sans relecture, seul un administrateur peut passer outre,
// et seulement après confirmation.

import {
  allerALaRacine,
  CHAMPS_PR,
  confirmer,
  demander,
  dire,
  estProtegee,
  etatCI,
  exigerGitHub,
  gh,
  ghJson,
  git,
  gras,
  nomOutil,
  permissionSurLeDepot,
  propositionDeLaBranche,
  nettoyerTachesFusionnees,
  recuperer,
  Stop,
} from '../commun.mjs';

export async function fusionner(options) {
  dire.titre('Fusionner une proposition');
  allerALaRacine();
  exigerGitHub();
  recuperer();

  const numero = await choisirProposition(options);
  const pr = ghJson(['pr', 'view', String(numero), '--json', `${CHAMPS_PR},mergeStateStatus`]);
  if (!(await fusionnerProposition(pr, options))) return;

  git(['fetch', '--prune', 'origin'], { autoriserEchec: true });
  const { supprimees } = nettoyerTachesFusionnees({ aussi: [pr.headRefName] });
  for (const { branche } of supprimees) dire.ok(`Branche ${branche} rangée sur ce PC.`);
  dire.suite(`ton binôme récupérera ce travail avec ${nomOutil('mettre-a-jour')}.`);
}

async function choisirProposition(options) {
  if (options.pr) {
    const numero = Number.parseInt(String(options.pr).replace(/^#|^n°/, ''), 10);
    if (!(numero > 0)) throw new Stop(`Numéro de proposition non compris : « ${options.pr} ».`, 2);
    return numero;
  }
  const branche = git(['branch', '--show-current']).sortie.trim();
  if (branche && !estProtegee(branche)) {
    const pr = propositionDeLaBranche(branche);
    if (pr) return pr.number;
  }
  const ouvertes = ghJson(['pr', 'list', '--state', 'open', '--json', 'number,title,author', '--limit', '30']) ?? [];
  if (!ouvertes.length) throw new Stop('Aucune proposition ouverte à fusionner.');
  const liste = ouvertes.map((p) => `  n°${p.number}  ${p.title} (${p.author?.login})`).join('\n');
  const reponse = await demander(`Propositions ouvertes :\n${liste}\nTape le numéro (n°) de celle à fusionner`, {
    option: '--pr <numéro>',
  });
  const numero = Number.parseInt(reponse.replace(/^#|^n°/, ''), 10);
  if (!ouvertes.some((p) => p.number === numero)) throw new Stop(`Pas de proposition ouverte n°${reponse}.`, 2);
  return numero;
}

/**
 * Vérifie puis fusionne. Renvoie true si c'est fait, false si l'utilisateur a renoncé.
 * Aussi utilisé par la fin de sprint (dev → main).
 */
export async function fusionnerProposition(pr, options) {
  dire.info(`n°${pr.number} ${gras(pr.title)} (${pr.headRefName} → ${pr.baseRefName})`);
  dire.info(pr.url);

  if (pr.state === 'MERGED') throw new Stop('Cette proposition est déjà fusionnée.');
  if (pr.state !== 'OPEN') throw new Stop('Cette proposition est fermée.');
  if (pr.isDraft) {
    throw new Stop("C'est un brouillon. Sur GitHub, clique « Ready for review » (prête pour relecture), puis relance.");
  }
  if (pr.mergeable === 'CONFLICTING') {
    throw new Stop(
      `Cette proposition est en conflit avec ${pr.baseRefName}. Sur la tâche ${pr.headRefName}, lance ${nomOutil('mettre-a-jour')} (Claude peut régler le conflit), puis ${nomOutil('envoyer')}.`,
    );
  }

  const ci = etatCI(pr.statusCheckRollup);
  if (ci === 'rouge') {
    throw new Stop(
      'Les vérifications automatiques sont rouges : on ne fusionne pas. Ouvre la proposition pour voir le test qui échoue (ou demande à Claude).',
    );
  }
  if (ci === 'en-cours') throw new Stop('Les vérifications automatiques tournent encore. Réessaie dans quelques minutes.');
  if (ci === 'aucune') {
    throw new Stop(
      "Aucune vérification automatique n'a encore tourné sur cette proposition. Attends quelques minutes ; si rien ne vient, demande à Claude.",
    );
  }
  dire.ok('Vérifications automatiques vertes.');

  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    throw new Stop('La relecture a demandé des changements. Corrige-les (puis renvoie), ou discutes-en dans la proposition.');
  }

  let passerOutre = false;
  if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    if (permissionSurLeDepot() !== 'ADMIN') {
      throw new Stop("Personne n'a encore accepté cette proposition : il faut la relecture de ton binôme avant de fusionner.");
    }
    dire.attention(
      "Personne n'a encore relu cette proposition. Tu es administrateur du dépôt : tu peux passer outre (tant que tu es seul).",
    );
    passerOutre = await confirmer('Fusionner sans relecture ?', {
      deja: options['sans-relecture'],
      option: '--sans-relecture',
    });
    if (!passerOutre) {
      dire.info("Fusion annulée : rien n'a changé.");
      return false;
    }
  } else if (pr.reviewDecision === 'APPROVED') {
    dire.ok('Relecture : acceptée.');
  }

  if (!passerOutre) {
    const oui = await confirmer(`Fusionner la proposition n°${pr.number} dans ${pr.baseRefName} ?`, { deja: options.oui });
    if (!oui) {
      dire.info("Fusion annulée : rien n'a changé.");
      return false;
    }
  }

  // dev reçoit un seul enregistrement propre par tâche (squash) ; main garde l'historique du sprint (merge commit).
  const methode = pr.baseRefName === 'main' ? '--merge' : '--squash';
  const args = [
    'pr',
    'merge',
    String(pr.number),
    methode,
    '--match-head-commit',
    pr.headRefOid,
    '--subject',
    `${pr.title} (#${pr.number})`,
  ];
  if (passerOutre) args.push('--admin');
  dire.etape('Je fusionne…');
  const r = gh(args, { autoriserEchec: true });
  if (r.code !== 0) throw new Stop(`GitHub a refusé la fusion :\n${r.erreur || r.sortie}`);
  dire.ok(`Proposition n°${pr.number} fusionnée dans ${pr.baseRefName}.`);
  return true;
}
