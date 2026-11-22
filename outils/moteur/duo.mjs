#!/usr/bin/env node
// Moteur des outils du duo Kadastr.
// Les fichiers à double-cliquer (outils/*.bat) et les commandes Claude Code (.claude/commands/) l'appellent.
//
// Usage : node outils/moteur/duo.mjs <action> [options]
//         node outils/moteur/duo.mjs aide
//
// Codes de sortie : 0 = fait, 1 = refusé par un garde-fou (rien de cassé), 2 = il manque une réponse ou une option,
// 3 = erreur inattendue.

import { parseArgs } from 'node:util';
import { commencer } from './actions/commencer.mjs';
import { envoyer } from './actions/envoyer.mjs';
import { etat } from './actions/etat.mjs';
import { finDEtape } from './actions/fin-d-etape.mjs';
import { fusionner } from './actions/fusionner.mjs';
import { mettreAJour } from './actions/mettre-a-jour.mjs';
import { proposer } from './actions/proposer.mjs';
import { emettre, fermerQuestions, gras, gris, modeInterface, rouge, Stop } from './commun.mjs';

const ACTIONS = {
  'mettre-a-jour': {
    fn: mettreAJour,
    titre: 'Mettre à jour',
    aide: 'récupère le dernier dev (et propose de l’intégrer à ta tâche)',
    options: '[--integrer | --pas-integrer]',
  },
  commencer: {
    fn: commencer,
    titre: 'Commencer une tâche',
    aide: 'crée la branche feat/<zone>-<sujet> depuis le dernier dev',
    options: '[--type feat|fix] [--zone <zone>] [--sujet "..."] | [--reprendre <branche>]',
  },
  envoyer: {
    fn: envoyer,
    titre: 'Envoyer mon travail',
    aide: 'enregistre (commit) et envoie (push) ton travail',
    options: '[--message "..."] [--type <type>] [--zone <zone>]',
  },
  proposer: {
    fn: proposer,
    titre: 'Proposer mon travail',
    aide: 'ouvre la proposition (pull request) vers dev',
    options: '[--titre "..."] [--quoi "..."] [--pourquoi "..."] [--brouillon]',
  },
  etat: {
    fn: etat,
    titre: "Où j'en suis",
    aide: 'branche, modifications, propositions, vérifications ; ne change rien',
    options: '[--json]',
  },
  fusionner: {
    fn: fusionner,
    titre: 'Fusionner',
    aide: 'fusionne une proposition aux vérifications vertes',
    options: '[--pr <numéro>] [--oui] [--sans-relecture]',
  },
  'fin-d-etape': {
    fn: finDEtape,
    titre: "Fin d'étape",
    aide: 'proposition dev → main, puis fusion et version v0.<étape>.0',
    options: '[--etape <n>] [--oui] [--sans-relecture] [--essai]',
  },
  interface: {
    // Chargée à la demande : le serveur local n'est utile qu'à la fenêtre des outils.
    fn: async (options) => (await import('./interface.mjs')).ouvrirInterface(options),
    titre: 'Outils',
    aide: 'ouvre la fenêtre des outils (page locale, sur ce PC seulement)',
    options: '[--sans-navigateur] [--port <n>] [--jeton <texte>]',
  },
};

const OPTIONS = {
  aide: { type: 'boolean', short: 'h' },
  type: { type: 'string' },
  zone: { type: 'string' },
  sujet: { type: 'string' },
  reprendre: { type: 'string' },
  message: { type: 'string' },
  titre: { type: 'string' },
  quoi: { type: 'string' },
  pourquoi: { type: 'string' },
  brouillon: { type: 'boolean' },
  base: { type: 'string' },
  pr: { type: 'string' },
  oui: { type: 'boolean' },
  'sans-relecture': { type: 'boolean' },
  integrer: { type: 'boolean' },
  'pas-integrer': { type: 'boolean' },
  etape: { type: 'string' },
  essai: { type: 'boolean' },
  json: { type: 'boolean' },
  'sans-navigateur': { type: 'boolean' },
  port: { type: 'string' },
  jeton: { type: 'string' },
};

function afficherAide() {
  console.log(`\n${gras('Outils du duo Kadastr')}\n`);
  console.log('Usage : node outils/moteur/duo.mjs <action> [options]\n');
  for (const [nom, action] of Object.entries(ACTIONS)) {
    console.log(`  ${gras(nom.padEnd(14))} ${action.aide}`);
    if (action.options) console.log(gris(`  ${''.padEnd(14)} ${action.options}`));
  }
  console.log('\nSans option, l’outil pose ses questions au clavier. Guide : docs/07-travailler-a-deux.md');
}

async function principal() {
  let analyse;
  try {
    analyse = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true, strict: true });
  } catch (erreur) {
    throw new Stop(`Option non comprise (${erreur.message}). Voir : node outils/moteur/duo.mjs aide`, 2);
  }
  const [nom = 'aide'] = analyse.positionals;
  const action = ACTIONS[nom];
  if (!action || analyse.values.aide) {
    afficherAide();
    if (nom !== 'aide' && !action) throw new Stop(`Action inconnue : « ${nom} ».`, 2);
    return;
  }
  process.title = `Kadastr - ${action.titre}`;
  await action.fn(analyse.values);
}

principal()
  .catch((erreur) => {
    if (modeInterface) {
      const stop = erreur instanceof Stop;
      emettre(stop ? 'stop' : 'erreur', { texte: erreur?.message ?? String(erreur), pile: stop ? '' : erreur?.stack });
      process.exitCode = stop ? erreur.codeSortie : 3;
    } else if (erreur instanceof Stop) {
      console.log(`\n${rouge(gras('Stop'))}  ${erreur.message}`);
      process.exitCode = erreur.codeSortie;
    } else {
      console.log(`\n${rouge(gras('Erreur inattendue'))} : ${erreur?.message}`);
      console.log(gris(erreur?.stack ?? ''));
      console.log('Copie ce message et demande à Claude de regarder.');
      process.exitCode = 3;
    }
  })
  .finally(fermerQuestions);
