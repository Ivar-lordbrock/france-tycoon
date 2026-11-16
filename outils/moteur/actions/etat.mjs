// « Où j'en suis » : branche, modifications, envois en attente, propositions ouvertes, vérifications (CI).
// Ne modifie rien. Termine par le conseil de la prochaine étape.

import {
  afficherFichiers,
  allerALaRacine,
  CHAMPS_PR,
  dire,
  ecart,
  estProtegee,
  etatCI,
  existe,
  ghJson,
  git,
  githubDisponible,
  gras,
  ilYA,
  LIBELLE_CI,
  LIBELLE_RELECTURE,
  modifications,
  nombre,
  nomOutil,
  permissionSurLeDepot,
  propositionDeLaBranche,
  recuperer,
  tachesLocales,
} from '../commun.mjs';

export async function etat() {
  dire.titre("Où j'en suis");
  allerALaRacine();
  const enLigne = recuperer({ tolerant: true });
  const branche = git(['branch', '--show-current']).sortie.trim();
  const mods = modifications();
  const surTache = Boolean(branche) && !estProtegee(branche);

  // --- Ta position ---------------------------------------------------------
  dire.section('Ta position');
  if (!branche) dire.info('Tu es sur aucune branche (HEAD détachée) : demande à Claude de te remettre sur dev.');
  else if (surTache) dire.info(`Tu es sur la tâche ${gras(branche)}.`);
  else {
    const role = branche === 'dev' ? 'la version de travail commune' : 'la version stable';
    dire.info(`Tu es sur ${gras(branche)} (${role}) : on n'y travaille pas directement.`);
  }

  if (mods.length) {
    dire.info(
      `${nombre(mods.length, 'fichier modifié', 'fichiers modifiés')}, pas encore enregistré${mods.length > 1 ? 's' : ''} :`,
    );
    afficherFichiers(mods, 8);
  } else {
    dire.info('Aucune modification en attente.');
  }

  let nonEnvoyes = 0;
  let retard = 0;
  if (surTache && existe('refs/remotes/origin/dev')) {
    const distante = `origin/${branche}`;
    nonEnvoyes = ecart('HEAD', existe(`refs/remotes/${distante}`) ? distante : 'origin/dev').avance;
    if (nonEnvoyes)
      dire.info(`${nombre(nonEnvoyes, 'enregistrement')} pas encore envoyé${nonEnvoyes > 1 ? 's' : ''} sur GitHub.`);
    retard = ecart('HEAD', 'origin/dev').retard;
    if (retard) dire.info(`dev a ${nombre(retard, 'nouveauté')} que ta tâche n'a pas.`);
  } else if (branche && existe(`refs/remotes/origin/${branche}`)) {
    retard = ecart('HEAD', `origin/${branche}`).retard;
    if (retard) dire.info(`${branche} a ${nombre(retard, 'nouveauté')} sur GitHub que ce PC n'a pas.`);
  }

  // --- GitHub --------------------------------------------------------------
  const avecGitHub = enLigne && githubDisponible();
  let maProposition = null;
  let fusionnee = null;
  let admin = false;

  if (avecGitHub) {
    admin = permissionSurLeDepot() === 'ADMIN';

    if (surTache) {
      dire.section('Ta proposition');
      maProposition = propositionDeLaBranche(branche);
      if (maProposition) {
        const p = maProposition;
        dire.info(`n°${p.number} ${gras(p.title)}${p.isDraft ? ' (brouillon)' : ''}`);
        dire.info(p.url);
        dire.info(`${LIBELLE_CI[etatCI(p.statusCheckRollup)]} ; ${LIBELLE_RELECTURE[p.reviewDecision ?? '']}.`);
        if (p.mergeable === 'CONFLICTING') dire.attention('Elle est en conflit avec dev.');
      } else {
        fusionnee = propositionDeLaBranche(branche, 'merged');
        dire.info(
          fusionnee ? `Déjà fusionnée (n°${fusionnee.number}).` : 'Pas encore de proposition pour cette tâche.',
        );
      }
    }

    dire.section('Propositions ouvertes sur le dépôt');
    const ouvertes = ghJson(['pr', 'list', '--state', 'open', '--json', CHAMPS_PR, '--limit', '30']) ?? [];
    if (!ouvertes.length) dire.info('Aucune.');
    for (const p of ouvertes) {
      const morceaux = [
        `n°${p.number} ${p.title}`,
        p.author?.login,
        p.isDraft ? 'brouillon' : null,
        LIBELLE_CI[etatCI(p.statusCheckRollup)],
        LIBELLE_RELECTURE[p.reviewDecision ?? ''],
      ].filter(Boolean);
      dire.info(morceaux.join(' — '));
    }

    dire.section('Dernière vérification de dev');
    const executions =
      ghJson([
        'run',
        'list',
        '--branch',
        'dev',
        '--workflow',
        'ci.yml',
        '--limit',
        '1',
        '--json',
        'conclusion,status,createdAt,url',
      ]) ?? [];
    const derniere = executions[0];
    if (!derniere) dire.info('Aucune pour le moment.');
    else {
      const resultat =
        derniere.status !== 'completed'
          ? 'en cours'
          : derniere.conclusion === 'success'
            ? 'verte'
            : `ROUGE (${derniere.conclusion})`;
      dire.info(`${resultat}, ${ilYA(derniere.createdAt)}`);
    }
  } else if (enLigne) {
    dire.attention(
      "GitHub CLI n'est pas prêt sur ce PC : je n'affiche pas les propositions. Lance 1-installer-mon-poste.",
    );
  }

  // --- Autres tâches ---------------------------------------------------------
  const autres = tachesLocales().filter((t) => t.nom !== branche);
  if (autres.length) {
    dire.section('Tes autres tâches sur ce PC');
    for (const t of autres) {
      dire.info(`${t.nom}${t.disparue ? ` (fusionnée : ${nomOutil('mettre-a-jour')} fera le ménage)` : ''}`);
    }
  }

  dire.suite(conseil({ branche, surTache, mods, nonEnvoyes, retard, maProposition, fusionnee, admin, avecGitHub }));
}

function conseil({ branche, surTache, mods, nonEnvoyes, retard, maProposition, fusionnee, admin, avecGitHub }) {
  if (!branche) return 'demande à Claude de te remettre sur dev.';
  if (!surTache) {
    if (mods.length) return `lance ${nomOutil('commencer')} : tes modifications te suivront sur la nouvelle tâche.`;
    if (retard) return `récupère les nouveautés avec ${nomOutil('mettre-a-jour')}, puis ${nomOutil('commencer')}.`;
    return `pour commencer quelque chose : ${nomOutil('commencer')}.`;
  }
  if (fusionnee && !mods.length)
    return `ta tâche est fusionnée : lance ${nomOutil('mettre-a-jour')} pour repartir de dev.`;
  if (mods.length || nonEnvoyes) return `sauvegarde ton travail sur GitHub : ${nomOutil('envoyer')}.`;
  if (!avecGitHub) return 'reconnecte-toi à internet pour voir où en est ta proposition.';
  if (!maProposition) return `continue ton travail. Quand la tâche est finie : ${nomOutil('proposer')}.`;
  if (maProposition.isDraft)
    return 'ta proposition est un brouillon : sur GitHub, clique « Ready for review » quand elle est prête.';
  if (maProposition.mergeable === 'CONFLICTING') {
    return `intègre les nouveautés de dev (${nomOutil('mettre-a-jour')}), puis renvoie (${nomOutil('envoyer')}).`;
  }
  const ci = etatCI(maProposition.statusCheckRollup);
  if (ci === 'rouge')
    return 'les vérifications sont rouges : ouvre la proposition pour voir le test qui échoue, ou demande à Claude.';
  if (ci === 'en-cours' || ci === 'aucune') return 'attends la fin des vérifications automatiques (quelques minutes).';
  if (maProposition.reviewDecision === 'CHANGES_REQUESTED')
    return 'la relecture demande des changements : corrige, puis renvoie.';
  if (maProposition.reviewDecision === 'REVIEW_REQUIRED') {
    return admin
      ? `tout est vert. Tant que tu es seul, tu peux fusionner toi-même : ${nomOutil('fusionner')}.`
      : 'tout est vert : ton binôme doit maintenant relire et accepter.';
  }
  return `tout est prêt : ${nomOutil('fusionner')}.`;
}
