// « Envoyer mon travail » : enregistre toutes les modifications (commit au format Conventional Commits)
// puis les envoie sur GitHub (push). Jamais sur main ni dev, jamais de force.

import {
  afficherFichiers,
  allerALaRacine,
  brancheActuelle,
  demander,
  dire,
  ecart,
  estProtegee,
  existe,
  fichiersRefuses,
  ghJson,
  git,
  githubDisponible,
  gras,
  messageCommit,
  modifications,
  nombre,
  nomOutil,
  pousser,
  propositionDeLaBranche,
  recuperer,
  Stop,
  verifierAucuneOperation,
} from '../commun.mjs';

export async function envoyer(options) {
  dire.titre('Envoyer mon travail');
  allerALaRacine();
  verifierAucuneOperation();
  const branche = brancheActuelle();
  const mods = modifications();

  if (estProtegee(branche)) {
    throw new Stop(
      mods.length
        ? `Tu es sur ${branche} : on n'y enregistre jamais directement (GitHub le refuserait). Lance ${nomOutil('commencer')} : ${mods.length === 1 ? 'ta modification partira' : `tes ${mods.length} modifications partiront`} avec la nouvelle tâche.`
        : `Tu es sur ${branche} et il n'y a rien à envoyer. Pour commencer une tâche : ${nomOutil('commencer')}.`,
    );
  }
  if (mods.some((m) => m.etat === 'en conflit')) {
    throw new Stop('Des fichiers sont en conflit. Demande à Claude : « règle les conflits ».');
  }

  const enLigne = recuperer({ tolerant: true });
  const distante = `origin/${branche}`;
  const surGitHub = existe(`refs/remotes/${distante}`);
  const suivi = git(['config', `branch.${branche}.merge`], { autoriserEchec: true }).sortie.trim();
  if (enLigne && !surGitHub && suivi === `refs/heads/${branche}`) {
    throw new Stop(
      `La branche ${branche} n'existe plus sur GitHub : la tâche a sans doute déjà été fusionnée. Tes modifications sont toujours sur ce PC. Demande à Claude : « déplace mes modifications sur une nouvelle tâche ».`,
    );
  }

  if (mods.length) {
    const refuses = fichiersRefuses(mods);
    if (refuses.length) {
      const liste = refuses.map((f) => `  - ${f.chemin} : ${f.raison}`).join('\n');
      throw new Stop(
        `Je n'envoie pas ces fichiers :\n${liste}\nDéplace-les hors du projet (ou demande à Claude), puis relance. Rien n'a été enregistré.`,
      );
    }
    dire.info(`${nombre(mods.length, 'fichier')} à enregistrer :`);
    afficherFichiers(mods);

    const texte =
      options.message ??
      (await demander("En une phrase, qu'as-tu fait ? (ex. : ajout du bouton acheter)", { option: '--message "..."' }));
    if (!texte.trim()) throw new Stop('Il faut une phrase pour décrire ton travail.', 2);
    const message = messageCommit(branche, texte, { type: options.type, zone: options.zone });
    if (message.length > 100) {
      throw new Stop(
        `Phrase trop longue (${message.length} caractères). Résume en moins de 80 caractères : tu pourras détailler dans la proposition.`,
        2,
      );
    }

    assurerSignature();
    git(['add', '--all']);
    git(['commit', '--quiet', '-F', '-'], { entree: `${message}\n` });
    dire.ok(`Enregistré : ${gras(message)}`);
  }

  if (!enLigne) {
    throw new Stop(
      `Ton travail est enregistré sur ce PC, mais GitHub ne répond pas. Relance ${nomOutil('envoyer')} quand internet revient.`,
    );
  }

  const aEnvoyer = ecart('HEAD', surGitHub ? distante : 'origin/dev').avance;
  if (!mods.length && aEnvoyer === 0) {
    dire.ok('Rien de nouveau à envoyer : GitHub a déjà tout.');
    dire.suite(`continue ton travail, ou, si la tâche est finie : ${nomOutil('proposer')}.`);
    return;
  }

  pousser(branche);
  dire.ok(`Envoyé sur GitHub (branche ${branche}).`);

  const pr = githubDisponible() ? propositionDeLaBranche(branche) : null;
  if (pr) {
    dire.info(`Ta proposition n°${pr.number} est mise à jour : ${pr.url}`);
    dire.suite(`les vérifications automatiques repartent. Pour suivre : ${nomOutil('etat')}.`);
  } else {
    dire.suite(`continue, et envoie aussi souvent que tu veux. Quand la tâche est finie : ${nomOutil('proposer')}.`);
  }
}

/** Git doit savoir qui signe. Si ce n'est pas réglé, on prend le compte GitHub (adresse « noreply », privée). */
function assurerSignature() {
  const nom = git(['config', 'user.name'], { autoriserEchec: true }).sortie.trim();
  const email = git(['config', 'user.email'], { autoriserEchec: true }).sortie.trim();
  if (nom && email) return;
  if (!githubDisponible()) {
    throw new Stop(`Git ne sait pas encore qui tu es (signature). Lance d'abord ${nomOutil('installer')}.`);
  }
  const moi = ghJson(['api', 'user']);
  if (!nom) git(['config', '--global', 'user.name', moi.name || moi.login]);
  if (!email) git(['config', '--global', 'user.email', `${moi.id}+${moi.login}@users.noreply.github.com`]);
  dire.info(`Signature Git réglée : ${moi.name || moi.login}.`);
}
