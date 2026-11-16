// « Où j'en suis » : branche, modifications, envois en attente, propositions ouvertes, vérifications (CI).
// Ne modifie rien. Termine par le conseil de la prochaine étape.
// Avec --json : les mêmes informations en JSON (pour l'interface), sans aucun message.

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
  seTaire,
  tachesLocales,
} from '../commun.mjs';

export async function etat(options = {}) {
  if (options.json) {
    seTaire();
    const donnees = collecter();
    process.stdout.write(`${JSON.stringify(donnees)}\n`);
    return;
  }
  dire.titre("Où j'en suis");
  afficher(collecter());
}

/** Résumé d'une proposition, pour l'affichage et l'interface. */
function resumer(p) {
  return {
    numero: p.number,
    titre: p.title,
    url: p.url,
    auteur: p.author?.login ?? '',
    brouillon: Boolean(p.isDraft),
    base: p.baseRefName,
    branche: p.headRefName,
    ci: etatCI(p.statusCheckRollup),
    relecture: p.reviewDecision ?? '',
    conflit: p.mergeable === 'CONFLICTING',
  };
}

function collecter() {
  allerALaRacine();
  const enLigne = recuperer({ tolerant: true });
  const branche = git(['branch', '--show-current']).sortie.trim();
  const mods = modifications();
  const surTache = Boolean(branche) && !estProtegee(branche);

  let nonEnvoyes = 0;
  let retard = 0;
  if (surTache && existe('refs/remotes/origin/dev')) {
    const distante = `origin/${branche}`;
    nonEnvoyes = ecart('HEAD', existe(`refs/remotes/${distante}`) ? distante : 'origin/dev').avance;
    retard = ecart('HEAD', 'origin/dev').retard;
  } else if (branche && existe(`refs/remotes/origin/${branche}`)) {
    retard = ecart('HEAD', `origin/${branche}`).retard;
  }

  const avecGitHub = enLigne && githubDisponible();
  let maProposition = null;
  let fusionnee = null;
  let admin = false;
  let ouvertes = [];
  let derniereCI = null;

  if (avecGitHub) {
    admin = permissionSurLeDepot() === 'ADMIN';
    if (surTache) {
      const p = propositionDeLaBranche(branche);
      if (p) maProposition = resumer(p);
      else {
        const f = propositionDeLaBranche(branche, 'merged');
        if (f) fusionnee = { numero: f.number, url: f.url };
      }
    }
    ouvertes = (ghJson(['pr', 'list', '--state', 'open', '--json', CHAMPS_PR, '--limit', '30']) ?? []).map(resumer);
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
    const d = executions[0];
    if (d) {
      derniereCI = {
        resultat: d.status !== 'completed' ? 'en-cours' : d.conclusion === 'success' ? 'verte' : 'rouge',
        conclusion: d.conclusion ?? '',
        quand: ilYA(d.createdAt),
        url: d.url,
      };
    }
  }

  const autres = tachesLocales().filter((t) => t.nom !== branche);
  const donnees = {
    enLigne,
    avecGitHub,
    admin,
    branche,
    surTache,
    modifications: mods,
    nonEnvoyes,
    retard,
    maProposition,
    fusionnee,
    ouvertes,
    derniereCI,
    autres,
  };
  donnees.conseil = conseil(donnees);
  return donnees;
}

function afficher(d) {
  const { branche, surTache, modifications: mods, nonEnvoyes, retard } = d;

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
  if (nonEnvoyes) {
    dire.info(`${nombre(nonEnvoyes, 'enregistrement')} pas encore envoyé${nonEnvoyes > 1 ? 's' : ''} sur GitHub.`);
  }
  if (retard) {
    dire.info(
      surTache
        ? `dev a ${nombre(retard, 'nouveauté')} que ta tâche n'a pas.`
        : `${branche} a ${nombre(retard, 'nouveauté')} sur GitHub que ce PC n'a pas.`,
    );
  }

  if (d.avecGitHub) {
    if (surTache) {
      dire.section('Ta proposition');
      const p = d.maProposition;
      if (p) {
        dire.info(`n°${p.numero} ${gras(p.titre)}${p.brouillon ? ' (brouillon)' : ''}`);
        dire.info(p.url);
        dire.info(`${LIBELLE_CI[p.ci]} ; ${LIBELLE_RELECTURE[p.relecture]}.`);
        if (p.conflit) dire.attention('Elle est en conflit avec dev.');
      } else {
        dire.info(
          d.fusionnee ? `Déjà fusionnée (n°${d.fusionnee.numero}).` : 'Pas encore de proposition pour cette tâche.',
        );
      }
    }

    dire.section('Propositions ouvertes sur le dépôt');
    if (!d.ouvertes.length) dire.info('Aucune.');
    for (const p of d.ouvertes) {
      const morceaux = [
        `n°${p.numero} ${p.titre}`,
        p.auteur,
        p.brouillon ? 'brouillon' : null,
        LIBELLE_CI[p.ci],
        LIBELLE_RELECTURE[p.relecture],
      ].filter(Boolean);
      dire.info(morceaux.join(' — '));
    }

    dire.section('Dernière vérification de dev');
    const c = d.derniereCI;
    if (!c) dire.info('Aucune pour le moment.');
    else {
      const resultat = { 'en-cours': 'en cours', verte: 'verte', rouge: `ROUGE (${c.conclusion})` }[c.resultat];
      dire.info(`${resultat}, ${c.quand}`);
    }
  } else if (d.enLigne) {
    dire.attention(
      `GitHub CLI n'est pas prêt sur ce PC : je n'affiche pas les propositions. Lance ${nomOutil('installer')}.`,
    );
  }

  if (d.autres.length) {
    dire.section('Tes autres tâches sur ce PC');
    for (const t of d.autres) {
      dire.info(`${t.nom}${t.disparue ? ` (fusionnée : ${nomOutil('mettre-a-jour')} fera le ménage)` : ''}`);
    }
  }

  dire.suite(d.conseil.texte);
}

/** Prochaine étape conseillée : { action (outil à mettre en avant, ou null), texte }. */
function conseil({
  branche,
  surTache,
  modifications: mods,
  nonEnvoyes,
  retard,
  maProposition,
  fusionnee,
  admin,
  enLigne,
  avecGitHub,
}) {
  const c = (action, texte) => ({ action, texte });
  if (!branche) return c(null, 'demande à Claude de te remettre sur dev.');
  if (!surTache) {
    if (mods.length)
      return c('commencer', `lance ${nomOutil('commencer')} : tes modifications te suivront sur la nouvelle tâche.`);
    if (retard)
      return c(
        'mettre-a-jour',
        `récupère les nouveautés avec ${nomOutil('mettre-a-jour')}, puis ${nomOutil('commencer')}.`,
      );
    return c('commencer', `pour commencer quelque chose : ${nomOutil('commencer')}.`);
  }
  if (fusionnee && !mods.length)
    return c('mettre-a-jour', `ta tâche est fusionnée : lance ${nomOutil('mettre-a-jour')} pour repartir de dev.`);
  if (mods.length || nonEnvoyes) return c('envoyer', `sauvegarde ton travail sur GitHub : ${nomOutil('envoyer')}.`);
  if (!avecGitHub) {
    return enLigne
      ? c('installer', `GitHub n'est pas prêt sur ce PC : lance ${nomOutil('installer')}.`)
      : c(null, 'reconnecte-toi à internet pour voir où en est ta proposition.');
  }
  if (!maProposition) return c('proposer', `continue ton travail. Quand la tâche est finie : ${nomOutil('proposer')}.`);
  if (maProposition.brouillon)
    return c(null, 'ta proposition est un brouillon : sur GitHub, clique « Ready for review » quand elle est prête.');
  if (maProposition.conflit) {
    return c(
      'mettre-a-jour',
      `intègre les nouveautés de dev (${nomOutil('mettre-a-jour')}), puis renvoie (${nomOutil('envoyer')}).`,
    );
  }
  if (maProposition.ci === 'rouge')
    return c(
      null,
      'les vérifications sont rouges : ouvre la proposition pour voir le test qui échoue, ou demande à Claude.',
    );
  if (maProposition.ci === 'en-cours' || maProposition.ci === 'aucune')
    return c(null, 'attends la fin des vérifications automatiques (quelques minutes).');
  if (maProposition.relecture === 'CHANGES_REQUESTED')
    return c(null, 'la relecture demande des changements : corrige, puis renvoie.');
  if (maProposition.relecture === 'REVIEW_REQUIRED') {
    return admin
      ? c('fusionner', `tout est vert. Tant que tu es seul, tu peux fusionner toi-même : ${nomOutil('fusionner')}.`)
      : c(null, 'tout est vert : ton binôme doit maintenant relire et accepter.');
  }
  return c('fusionner', `tout est prêt : ${nomOutil('fusionner')}.`);
}
