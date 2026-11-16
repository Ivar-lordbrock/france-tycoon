// « Mettre à jour » : récupère le dernier dev depuis GitHub.
// Sur dev : avance dev. Sur une tâche : montre les nouveautés et propose de les intégrer.
// Fait aussi le ménage des tâches déjà fusionnées.

import {
  afficherListe,
  allerALaRacine,
  brancheActuelle,
  confirmer,
  dire,
  ecart,
  estProtegee,
  git,
  modifications,
  nettoyerTachesFusionnees,
  nombre,
  nomOutil,
  recuperer,
  Stop,
  titresEntre,
  verifierAucuneOperation,
} from '../commun.mjs';

export async function mettreAJour(options) {
  dire.titre('Mettre à jour');
  allerALaRacine();
  verifierAucuneOperation();
  recuperer();

  const { supprimees } = nettoyerTachesFusionnees();
  for (const { branche, pr } of supprimees) {
    dire.ok(`La tâche ${branche} a été fusionnée (proposition n°${pr}) : je l'ai rangée.`);
  }

  const branche = brancheActuelle();
  if (estProtegee(branche)) return mettreAJourBrancheCommune(branche);
  return mettreAJourTache(branche, options);
}

function mettreAJourBrancheCommune(brancheDepart) {
  const mods = modifications();
  let branche = brancheDepart;
  if (branche === 'main' && !mods.length) {
    git(['switch', 'dev']);
    dire.info('Tu étais sur main (la version stable) : je te mets sur dev, la version de travail commune.');
    branche = 'dev';
  }

  const { avance, retard } = ecart('HEAD', `origin/${branche}`);
  if (avance > 0) {
    throw new Stop(
      `Ta copie de ${branche} contient ${nombre(avance, 'enregistrement')} qui ne sont pas sur GitHub. On ne travaille jamais directement sur ${branche}. Demande à Claude : « déplace mes enregistrements de ${branche} sur une nouvelle tâche ».`,
    );
  }
  if (retard === 0) {
    dire.ok(`${branche} est déjà à jour.`);
  } else {
    const titres = titresEntre('HEAD', `origin/${branche}`);
    const r = git(['merge', '--ff-only', `origin/${branche}`], { autoriserEchec: true });
    if (r.code !== 0) {
      throw new Stop(
        `Je n'ai pas pu mettre ${branche} à jour : tes modifications non enregistrées touchent les mêmes fichiers que les nouveautés. Lance ${nomOutil('commencer')} pour les ranger dans une tâche, puis relance.`,
      );
    }
    dire.ok(`${branche} est à jour : ${nombre(retard, 'nouveauté')} récupérée${retard > 1 ? 's' : ''}.`);
    afficherListe(titres);
  }

  if (mods.length) {
    dire.attention(
      `Tu as ${nombre(mods.length, 'modification')} non enregistrée${mods.length > 1 ? 's' : ''} sur ${branche}. On ne travaille pas directement sur ${branche}.`,
    );
    dire.suite(`lance ${nomOutil('commencer')} : tes modifications te suivront sur la nouvelle tâche.`);
  } else {
    dire.suite(`pour commencer quelque chose : ${nomOutil('commencer')}.`);
  }
}

async function mettreAJourTache(branche, options) {
  // Avance aussi la copie locale de dev, sans changer de branche (échoue sans danger si impossible).
  git(['fetch', 'origin', 'dev:dev'], { autoriserEchec: true });

  const { retard } = ecart('HEAD', 'origin/dev');
  if (retard === 0) {
    dire.ok(`Ta tâche ${branche} contient déjà tout le dernier dev.`);
    dire.suite(`continue ton travail. Pour le sauvegarder sur GitHub : ${nomOutil('envoyer')}.`);
    return;
  }

  dire.info(`dev a ${nombre(retard, 'nouveauté')} que ta tâche ${branche} n'a pas encore :`);
  afficherListe(titresEntre('HEAD', 'origin/dev'));

  if (options['pas-integrer']) {
    dire.suite(`tu pourras les intégrer plus tard avec ${nomOutil('mettre-a-jour')}.`);
    return;
  }
  if (modifications().length) {
    dire.attention("Tu as des modifications non enregistrées : je n'intègre pas les nouveautés maintenant.");
    dire.suite(`envoie ton travail (${nomOutil('envoyer')}), puis relance ${nomOutil('mettre-a-jour')}.`);
    return;
  }

  const integrer = await confirmer('Les intégrer dans ta tâche maintenant ?', {
    deja: options.integrer,
    option: '--integrer (ou --pas-integrer)',
  });
  if (!integrer) {
    dire.suite(`tu pourras les intégrer plus tard avec ${nomOutil('mettre-a-jour')}.`);
    return;
  }

  dire.etape("J'intègre les nouveautés de dev dans ta tâche…");
  const r = git(['merge', '--no-edit', 'origin/dev'], { autoriserEchec: true });
  if (r.code !== 0) {
    git(['merge', '--abort'], { autoriserEchec: true });
    throw new Stop(
      "Conflit : les nouveautés de dev et ta tâche modifient les mêmes lignes. J'ai tout remis comme avant, rien n'est perdu. Demande à Claude : « intègre dev dans ma tâche et règle les conflits ».",
    );
  }
  dire.ok('Nouveautés intégrées dans ta tâche.');
  dire.suite(`envoie-les sur GitHub avec ${nomOutil('envoyer')}.`);
}
