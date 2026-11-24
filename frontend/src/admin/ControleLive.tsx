import type { CadeauCorps } from '@france-tycoon/shared';
import { type FormEvent, useState } from 'react';
import { useActionAdmin, useCadeau, useSiteAdmin } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { boutonSecondaire, Confirmer } from '../panels/Confirmer.tsx';
import { entier, tycoons } from '../panels/fiche-texte.ts';
import { champ, quand } from './Joueurs.tsx';
import { Evenements, ReglagesPermanents } from './Reglages.tsx';
import { Section } from './VueEnsemble.tsx';

const DUREES: [string, string][] = [
  ['1', '1 heure'],
  ['6', '6 heures'],
  ['24', '24 heures'],
  ['72', '3 jours'],
  ['168', '7 jours'],
  ['', 'Sans fin'],
];
const texteOk = (t: string) => t.trim().length >= 3 && t.trim().length <= 300;
const etiquette = 'flex flex-col gap-1 text-sm font-semibold text-ardoise';
const don = (c: CadeauCorps) => (c.currency === 'cash' ? tycoons(c.amount) : `${entier(c.amount)} gemmes`);

/** Contrôle live (admins) : maintenance, bannière, cadeaux, réglages à chaud et événements. Tout va à l'audit. */
export function ControleLive() {
  return (
    <div className="mt-4 flex flex-col gap-8">
      <Maintenance />
      <Banniere />
      <Cadeau />
      <ReglagesPermanents />
      <Evenements />
    </div>
  );
}

function Maintenance() {
  const { data } = useSiteAdmin();
  const envoi = useActionAdmin();
  const [message, setMessage] = useState('');
  const [arme, setArme] = useState(false);
  const actuel = data?.maintenance ?? null;
  const poser = (m: string | null) =>
    envoi.mutate(
      { methode: 'PUT', url: 'site/maintenance', corps: { message: m } },
      {
        onSuccess: () => {
          setMessage('');
          setArme(false);
        },
      },
    );
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (!texteOk(message)) return;
    // Bloquer tous les joueurs : deuxième clic pour confirmer.
    if (actuel === null && !arme) setArme(true);
    else poser(message.trim());
  };

  return (
    <Section titre="Maintenance">
      <form onSubmit={valider} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4">
        <p className="text-sm">
          {actuel === null ? (
            <span className="text-ardoise">Coupée : les joueurs jouent normalement.</span>
          ) : (
            <>
              <strong className="text-alerte">En cours.</strong> Les joueurs regardent sans agir. Message : « {actuel} »
            </>
          )}
        </p>
        <label className={etiquette}>
          {actuel === null ? 'Message aux joueurs' : 'Nouveau message'}
          <input
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setArme(false);
            }}
            maxLength={300}
            placeholder="ex. Mise à jour du serveur, retour vers 21 h."
            className={champ}
          />
        </label>
        <Erreur erreur={envoi.error} />
        <div className="flex flex-wrap justify-end gap-2">
          {actuel !== null && (
            <button type="button" onClick={() => poser(null)} disabled={envoi.isPending} className={boutonSecondaire}>
              Couper la maintenance
            </button>
          )}
          <button
            type="submit"
            disabled={!texteOk(message) || envoi.isPending}
            className={
              arme ? 'h-10 rounded-xl bg-danger px-4 font-semibold text-fond disabled:opacity-50' : 'relief h-10 px-4'
            }
          >
            {actuel !== null
              ? 'Changer le message'
              : arme
                ? 'Confirmer : bloquer les joueurs'
                : 'Lancer la maintenance'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function Banniere() {
  const { data } = useSiteAdmin();
  const envoi = useActionAdmin();
  const [texte, setTexte] = useState('');
  const [duree, setDuree] = useState('24');
  const actuelle = data?.banner ?? null;
  const poser = (text: string | null, hours: number | null) =>
    envoi.mutate({ methode: 'PUT', url: 'site/banner', corps: { text, hours } }, { onSuccess: () => setTexte('') });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (texteOk(texte)) poser(texte.trim(), duree ? Number(duree) : null);
  };

  return (
    <Section titre="Bannière d’annonce">
      <form onSubmit={valider} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4">
        <p className="text-sm">
          {actuelle === null ? (
            <span className="text-ardoise">Aucune bannière.</span>
          ) : (
            <>
              <strong>Affichée</strong> {actuelle.until === null ? 'sans fin' : `jusqu’au ${quand(actuelle.until)}`} : «{' '}
              {actuelle.text} »
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <label className={`${etiquette} flex-1 basis-64`}>
            Texte
            <input
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              maxLength={300}
              placeholder="ex. Week-end : nouvelles quêtes !"
              className={champ}
            />
          </label>
          <label className={etiquette}>
            Durée
            <select value={duree} onChange={(e) => setDuree(e.target.value)} className={champ}>
              {DUREES.map(([v, libelle]) => (
                <option key={v} value={v}>
                  {libelle}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-ardoise">Le joueur peut la fermer ; elle revient si le texte change.</p>
        <Erreur erreur={envoi.error} />
        <div className="flex flex-wrap justify-end gap-2">
          {actuelle !== null && (
            <button
              type="button"
              onClick={() => poser(null, null)}
              disabled={envoi.isPending}
              className={boutonSecondaire}
            >
              Retirer la bannière
            </button>
          )}
          <button type="submit" disabled={!texteOk(texte) || envoi.isPending} className="relief h-10 px-4">
            {actuelle === null ? 'Afficher' : 'Remplacer'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function Cadeau() {
  const envoi = useCadeau();
  const [pour, setPour] = useState<'tous' | 'un'>('tous');
  const [joueur, setJoueur] = useState('');
  const [devise, setDevise] = useState<CadeauCorps['currency']>('gems');
  const [somme, setSomme] = useState('');
  const [message, setMessage] = useState('');
  const [apercu, setApercu] = useState<CadeauCorps | null>(null);
  const n = Number(somme);
  const id = Number(joueur);
  const ok =
    Number.isInteger(n) && n >= 1 && n <= 1_000_000_000 && message.trim().length >= 3 && (pour === 'tous' || id >= 1);

  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    envoi.reset();
    setApercu({ currency: devise, amount: n, reason: message.trim(), ...(pour === 'un' ? { playerId: id } : {}) });
  };

  if (apercu) {
    return (
      <Section titre="Cadeau">
        <div className="max-w-xl">
          <Confirmer
            titre="Envoyer ce cadeau ?"
            lignes={[
              [
                'Pour',
                apercu.playerId === undefined ? 'Tous les joueurs actifs (sauf toi)' : `Joueur n° ${apercu.playerId}`,
              ],
              ['Cadeau', don(apercu)],
              ['Message', apercu.reason],
            ]}
            note="L’argent passe par le journal des transactions. Chaque joueur reçoit le message dans ses notifications. On ne peut pas l’annuler."
            annuler="Modifier"
            valider="Envoyer"
            focusSur="annuler"
            occupe={envoi.isPending}
            erreur={envoi.error ? messageErreur(envoi.error) : null}
            onAnnuler={() => setApercu(null)}
            onValider={() =>
              envoi.mutate(apercu, {
                onSuccess: () => {
                  setApercu(null);
                  setSomme('');
                  setMessage('');
                },
              })
            }
          />
        </div>
      </Section>
    );
  }
  return (
    <Section titre="Cadeau">
      <form onSubmit={valider} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4">
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <legend className="sr-only">Pour qui</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={pour === 'tous'} onChange={() => setPour('tous')} />
            Tous les joueurs actifs (sauf toi)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={pour === 'un'} onChange={() => setPour('un')} />
            Un joueur
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          {pour === 'un' && (
            <label className={`${etiquette} w-32`}>
              Joueur n°
              <input
                inputMode="numeric"
                value={joueur}
                onChange={(e) => setJoueur(e.target.value.replace(/\D/g, ''))}
                placeholder="ex. 12"
                className={`${champ} tabular-nums`}
              />
            </label>
          )}
          <label className={etiquette}>
            Monnaie
            <select
              value={devise}
              onChange={(e) => setDevise(e.target.value as CadeauCorps['currency'])}
              className={champ}
            >
              <option value="gems">Gemmes</option>
              <option value="cash">Tycoons (₮)</option>
            </select>
          </label>
          <label className={`${etiquette} w-36`}>
            Montant
            <input
              inputMode="numeric"
              value={somme}
              onChange={(e) => setSomme(e.target.value.replace(/\D/g, ''))}
              placeholder="ex. 50"
              className={`${champ} tabular-nums`}
            />
          </label>
        </div>
        <label className={etiquette}>
          Message aux joueurs (gardé aussi dans l’audit)
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="ex. Merci d’avoir testé la bêta !"
            className={champ}
          />
        </label>
        {envoi.isSuccess && (
          <p role="status" className="text-sm text-succes">
            Envoyé à {entier(envoi.data.count)} joueur{envoi.data.count > 1 ? 's' : ''}.
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={!ok} className="relief h-10 px-4">
            Voir avant d’envoyer
          </button>
        </div>
      </form>
    </Section>
  );
}

function Erreur({ erreur }: { erreur: Error | null }) {
  return erreur ? (
    <p role="alert" className="text-sm text-danger">
      {messageErreur(erreur)}
    </p>
  ) : null;
}
