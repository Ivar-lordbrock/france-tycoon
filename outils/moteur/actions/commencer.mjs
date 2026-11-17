// « Commencer une tâche » : crée une branche feat/<zone>-<sujet> (ou fix/…) à partir du dernier dev.
// Peut aussi reprendre une tâche déjà commencée.

import {
  allerALaRacine,
  brancheActuelle,
  choisir,
  confirmer,
  demander,
  dire,
  ecart,
  estProtegee,
  existe,
  git,
  gras,
  modifications,
  nomBranche,
  nombre,
  nomOutil,
  recuperer,
  Stop,
  slug,
  TYPES,
  tachesLocales,
  verifierAucuneOperation,
  ZONES,
} from '../commun.mjs';

export async function commencer(options) {
  dire.titre('Commencer une tâche');
  allerALaRacine();
  verifierAucuneOperation();
  const actuelle = brancheActuelle();
  const mods = modifications();

  if (!estProtegee(actuelle) && mods.length) {
    throw new Stop(
      `Tu as ${nombre(mods.length, 'modification')} pas encore envoyée${mods.length > 1 ? 's' : ''} sur la tâche ${actuelle}. Envoie-les d'abord (${nomOutil('envoyer')}), puis relance.`,
    );
  }
  recuperer();

  if (options.reprendre) return reprendre(options.reprendre, actuelle);

  // Proposer de reprendre une tâche en cours (au clavier seulement).
  if (!options.sujet && !options.type && !options.zone) {
    const enCours = tachesLocales()
      .filter((t) => t.nom !== actuelle && !t.disparue)
      .map((t) => t.nom);
    if (enCours.length) {
      const liste = enCours.map((b, i) => `  ${i + 1}. ${b}`).join('\n');
      const reponse = await demander(
        `Tu as déjà des tâches en cours :\n${liste}\nTape son numéro pour la reprendre, ou Entrée pour une nouvelle tâche`,
        {
          facultatif: true,
          interface: {
            genre: 'choix',
            question: 'Tu as déjà des tâches en cours. Tu en reprends une ?',
            choix: [
              ...enCours.map((b) => ({ valeur: b, libelle: b, detail: 'reprendre cette tâche' })),
              { valeur: '', libelle: 'Non, une nouvelle tâche' },
            ],
          },
        },
      );
      if (enCours.includes(reponse)) return reprendre(reponse, actuelle);
      const rang = Number.parseInt(reponse, 10);
      if (rang >= 1 && rang <= enCours.length) return reprendre(enCours[rang - 1], actuelle);
    }
  }

  const type =
    options.type ??
    (await choisir(
      "C'est :",
      Object.entries(TYPES).map(([valeur, libelle]) => ({ valeur, libelle })),
      { defaut: 'feat', option: '--type feat|fix' },
    ));
  if (!TYPES[type]) throw new Stop(`Type inconnu : « ${type} ». Choix possibles : feat, fix.`, 2);

  const zone =
    options.zone ??
    (await choisir(
      'Ça touche surtout :',
      Object.entries(ZONES).map(([valeur, detail]) => ({ valeur, libelle: valeur, detail })),
      { option: `--zone ${Object.keys(ZONES).join('|')}` },
    ));
  if (!ZONES[zone])
    throw new Stop(`Zone inconnue : « ${zone} ». Choix possibles : ${Object.keys(ZONES).join(', ')}.`, 2);

  const sujet =
    options.sujet ??
    (await demander('En quelques mots, sur quoi vas-tu travailler ? (ex. : achat de territoire)', {
      option: '--sujet "..."',
    }));
  if (!slug(sujet)) throw new Stop('Il me faut quelques mots (lettres ou chiffres) pour nommer la tâche.', 2);
  const branche = nomBranche(type, zone, sujet);

  if (existe(`refs/heads/${branche}`)) {
    const oui = await confirmer(`La tâche ${branche} existe déjà sur ce PC. La reprendre ?`, {
      option: `--reprendre ${branche}`,
    });
    if (oui) return reprendre(branche, actuelle);
    throw new Stop('Choisis un nom un peu différent, puis relance.');
  }
  if (existe(`refs/remotes/origin/${branche}`)) {
    throw new Stop(
      `Une tâche ${branche} existe déjà sur GitHub (peut-être celle de ton binôme). Choisis un nom un peu différent.`,
    );
  }

  if (mods.length) {
    // Modifications faites sur dev ou main par erreur : elles partent avec la nouvelle tâche.
    git(['switch', '-c', branche]);
    if (git(['merge-base', '--is-ancestor', 'HEAD', 'origin/dev'], { autoriserEchec: true }).code === 0) {
      if (git(['merge', '--ff-only', 'origin/dev'], { autoriserEchec: true }).code !== 0) {
        dire.attention(
          `Ta tâche part d'une version un peu ancienne de dev (tes modifications touchent des fichiers qui ont changé). Ce n'est pas grave : après avoir envoyé ton travail, lance ${nomOutil('mettre-a-jour')}.`,
        );
      }
    } else {
      dire.attention(`Ta tâche part de ${actuelle}, pas du dernier dev. Demande à Claude de vérifier.`);
    }
    const suivies =
      mods.length > 1
        ? `Tes ${mods.length} modifications en cours l'ont suivie`
        : "Ta modification en cours l'a suivie";
    dire.ok(`Tâche ${gras(branche)} créée. ${suivies}.`);
  } else {
    git(['switch', '--no-track', '-c', branche, 'origin/dev']);
    git(['fetch', 'origin', 'dev:dev'], { autoriserEchec: true });
    dire.ok(`Tâche ${gras(branche)} créée à partir du dernier dev.`);
  }
  dire.suite(
    `travaille normalement (avec Claude ou ton éditeur). Pour sauvegarder ton travail sur GitHub : ${nomOutil('envoyer')}.`,
  );
}

function reprendre(branche, actuelle) {
  if (estProtegee(branche)) throw new Stop(`${branche} n'est pas une tâche : on n'y travaille pas directement.`, 2);
  if (branche === actuelle) {
    dire.ok(`Tu es déjà sur la tâche ${gras(branche)}.`);
    return;
  }
  if (!existe(`refs/heads/${branche}`) && !existe(`refs/remotes/origin/${branche}`)) {
    throw new Stop(`Je ne trouve pas la tâche ${branche}.`, 2);
  }
  const r = git(['switch', branche], { autoriserEchec: true });
  if (r.code !== 0) {
    throw new Stop(
      `Impossible de passer sur ${branche} : tes modifications en cours le bloquent. Demande à Claude de regarder.\n${r.erreur}`,
    );
  }
  dire.ok(`Tu as repris la tâche ${gras(branche)}.`);
  const { retard } = ecart('HEAD', 'origin/dev');
  if (retard)
    dire.info(`dev a ${nombre(retard, 'nouveauté')} depuis : ${nomOutil('mettre-a-jour')} pour les intégrer.`);
  dire.suite(`continue ton travail. Pour le sauvegarder sur GitHub : ${nomOutil('envoyer')}.`);
}
