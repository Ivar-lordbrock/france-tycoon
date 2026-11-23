import {
  type EvenementCorps,
  type LigneEvenement,
  REGLAGE_PCT_MAX,
  REGLAGE_PCT_MIN,
  type ReglagesCorps,
  type Reglages as Valeurs,
} from '@france-tycoon/shared';
import { type FormEvent, useState } from 'react';
import { useActionAdmin, useReglagesAdmin } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { effetsReglages } from '../hud/BandeauSite.tsx';
import { Confirmer, petitBouton } from '../panels/Confirmer.tsx';
import { champ, Pastille, quand, Table } from './Joueurs.tsx';
import { Chiffre, Section } from './VueEnsemble.tsx';

// Réglages à chaud (étape 6) : trois % (100 = normal), permanents ou le temps d'un événement daté.

type Champs = Record<keyof Valeurs, string>;
const NOMS: [keyof Valeurs, string][] = [
  ['price', 'Prix des communes'],
  ['income', 'Revenus'],
  ['building', 'Coût des bâtiments'],
];
const etiquette = 'flex flex-col gap-1 text-sm font-semibold text-ardoise';
const pctOk = (s: string) => /^\d+$/.test(s) && Number(s) >= REGLAGE_PCT_MIN && Number(s) <= REGLAGE_PCT_MAX;
const effets = (r: Valeurs) => effetsReglages(r) || 'Aucun effet (tout à 100 %)';
const AIDE = `Entre ${REGLAGE_PCT_MIN} et ${REGLAGE_PCT_MAX} %. 100 = normal, 200 = deux fois plus, 50 = moitié.`;

function ChampsPct({
  valeurs,
  setValeurs,
  actuels,
}: {
  valeurs: Champs;
  setValeurs: (v: Champs) => void;
  actuels: Valeurs;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {NOMS.map(([cle, nom]) => (
        <label key={cle} className={`${etiquette} w-40`}>
          {nom} (%)
          <input
            inputMode="numeric"
            value={valeurs[cle]}
            onChange={(e) => setValeurs({ ...valeurs, [cle]: e.target.value.replace(/\D/g, '') })}
            placeholder={String(actuels[cle])}
            aria-invalid={valeurs[cle] !== '' && !pctOk(valeurs[cle])}
            className={`${champ} tabular-nums`}
          />
        </label>
      ))}
    </div>
  );
}

const vides: Champs = { price: '', income: '', building: '' };

/** Réglages permanents : s'appliquent tout de suite, à tous ; le passé ne change pas. */
export function ReglagesPermanents() {
  const { data } = useReglagesAdmin();
  const envoi = useActionAdmin();
  const [valeurs, setValeurs] = useState<Champs>(vides);
  const [motif, setMotif] = useState('');
  const [apercu, setApercu] = useState<ReglagesCorps | null>(null);
  if (!data) {
    return (
      <Section titre="Réglages permanents">
        <p className="text-sm text-ardoise">Chargement…</p>
      </Section>
    );
  }
  // Un champ vide garde la valeur actuelle.
  const valeur = (cle: keyof Valeurs) => (valeurs[cle] === '' ? data.base[cle] : Number(valeurs[cle]));
  const ok =
    NOMS.every(([cle]) => valeurs[cle] === '' || pctOk(valeurs[cle])) &&
    NOMS.some(([cle]) => valeur(cle) !== data.base[cle]) &&
    motif.trim().length >= 3;
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (ok)
      setApercu({
        price: valeur('price'),
        income: valeur('income'),
        building: valeur('building'),
        reason: motif.trim(),
      });
  };

  return (
    <Section titre="Réglages permanents">
      <div className="flex flex-col gap-4">
        <dl className="panneau grid max-w-xl grid-cols-3 divide-x divide-encre/10">
          {NOMS.map(([cle, nom]) => (
            <Chiffre key={cle} libelle={nom}>
              <span className="tabular-nums">{data.effective[cle]} %</span>
              {data.effective[cle] !== data.base[cle] && (
                <span className="block text-xs font-normal text-ardoise">
                  base {data.base[cle]} %, événement en plus
                </span>
              )}
            </Chiffre>
          ))}
        </dl>
        {apercu ? (
          <div className="max-w-xl">
            <Confirmer
              titre="Appliquer ces réglages ?"
              lignes={[
                ...NOMS.filter(([cle]) => apercu[cle] !== data.base[cle]).map(([cle, nom]): [string, string] => [
                  nom,
                  `${data.base[cle]} % → ${apercu[cle]} %`,
                ]),
                ['Motif', apercu.reason],
              ]}
              note="Tout de suite, pour tous les joueurs. Les revenus déjà gagnés ne changent pas. Le changement va au journal d’audit."
              annuler="Modifier"
              valider="Appliquer"
              focusSur="annuler"
              occupe={envoi.isPending}
              erreur={envoi.error ? messageErreur(envoi.error) : null}
              onAnnuler={() => setApercu(null)}
              onValider={() =>
                envoi.mutate(
                  { methode: 'PUT', url: 'live-config', corps: apercu },
                  {
                    onSuccess: () => {
                      setApercu(null);
                      setValeurs(vides);
                      setMotif('');
                    },
                  },
                )
              }
            />
          </div>
        ) : (
          <form onSubmit={valider} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4">
            <ChampsPct valeurs={valeurs} setValeurs={setValeurs} actuels={data.base} />
            <p className="text-xs text-ardoise">{AIDE} Un champ vide garde la valeur actuelle.</p>
            <label className={etiquette}>
              Motif (gardé dans l’audit)
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                maxLength={500}
                placeholder="ex. Les communes partent trop vite"
                className={champ}
              />
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={!ok} className="relief h-10 px-4">
                Voir avant d’appliquer
              </button>
            </div>
          </form>
        )}
        {data.versions.length > 0 && (
          <Table
            colonnes={[['Depuis'], ['Prix', true], ['Revenus', true], ['Bâtiments', true], ['Par'], ['Motif']]}
            vide="Aucun changement."
            lignes={data.versions.map((v) => [
              v.id,
              [
                <span key="d" className="whitespace-nowrap">
                  {quand(v.startsAt)}
                </span>,
                <span key="p" className="tabular-nums">
                  {v.price} %
                </span>,
                <span key="r" className="tabular-nums">
                  {v.income} %
                </span>,
                <span key="b" className="tabular-nums">
                  {v.building} %
                </span>,
                v.by ?? '—',
                v.reason,
              ],
            ])}
          />
        )}
      </div>
    </Section>
  );
}

const DUREES: [number, string][] = [
  [1, '1 heure'],
  [6, '6 heures'],
  [24, '24 heures'],
  [48, '2 jours'],
  [72, '3 jours'],
  [168, '7 jours'],
  [336, '14 jours'],
  [720, '30 jours'],
];
const ETATS: Record<LigneEvenement['status'], { libelle: string; classe: string }> = {
  upcoming: { libelle: 'À venir', classe: 'bg-surligneur/20 text-encre' },
  active: { libelle: 'En cours', classe: 'bg-succes/15 text-succes' },
  ended: { libelle: 'Fini', classe: 'bg-brume text-ardoise' },
  cancelled: { libelle: 'Annulé', classe: 'bg-brume text-ardoise' },
};
const pourDebut = (local: string) => (local === '' ? undefined : Math.floor(new Date(local).getTime() / 1000));

/** Événements datés : leurs % multiplient les réglages permanents, de leur début à leur fin automatique. */
export function Evenements() {
  const { data } = useReglagesAdmin();
  const envoi = useActionAdmin();
  const arret = useActionAdmin();
  const [titre, setTitre] = useState('');
  const [valeurs, setValeurs] = useState<Champs>(vides);
  const [debut, setDebut] = useState('');
  const [heures, setHeures] = useState(48);
  const [apercu, setApercu] = useState<EvenementCorps | null>(null);
  const [arme, setArme] = useState<number | null>(null);

  const valeur = (cle: keyof Valeurs) => (valeurs[cle] === '' ? 100 : Number(valeurs[cle]));
  const ok =
    titre.trim().length >= 3 &&
    NOMS.every(([cle]) => valeurs[cle] === '' || pctOk(valeurs[cle])) &&
    NOMS.some(([cle]) => valeur(cle) !== 100);
  const valider = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const startsAt = pourDebut(debut);
    setApercu({
      title: titre.trim(),
      price: valeur('price'),
      income: valeur('income'),
      building: valeur('building'),
      hours: heures,
      ...(startsAt ? { startsAt } : {}),
    });
  };

  return (
    <Section titre="Événements">
      <div className="flex flex-col gap-4">
        {apercu ? (
          <div className="max-w-xl">
            <Confirmer
              titre="Lancer cet événement ?"
              lignes={[
                ['Titre', apercu.title],
                ['Effets', effets(apercu)],
                ['Début', apercu.startsAt ? quand(apercu.startsAt) : 'Tout de suite'],
                ['Fin automatique', quand((apercu.startsAt ?? Math.floor(Date.now() / 1000)) + apercu.hours * 3_600)],
              ]}
              note="Les joueurs le voient en haut de la carte. Ses effets se multiplient avec les réglages permanents. Tu peux l’arrêter avant la fin."
              annuler="Modifier"
              valider="Lancer"
              focusSur="annuler"
              occupe={envoi.isPending}
              erreur={envoi.error ? messageErreur(envoi.error) : null}
              onAnnuler={() => setApercu(null)}
              onValider={() =>
                envoi.mutate(
                  { methode: 'POST', url: 'events', corps: apercu },
                  {
                    onSuccess: () => {
                      setApercu(null);
                      setTitre('');
                      setValeurs(vides);
                      setDebut('');
                    },
                  },
                )
              }
            />
          </div>
        ) : (
          <form onSubmit={valider} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-encre/15 p-4">
            <label className={etiquette}>
              Titre (vu par les joueurs)
              <input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                maxLength={80}
                placeholder="ex. Week-end doré"
                className={champ}
              />
            </label>
            <ChampsPct valeurs={valeurs} setValeurs={setValeurs} actuels={{ price: 100, income: 100, building: 100 }} />
            <p className="text-xs text-ardoise">{AIDE}</p>
            <div className="flex flex-wrap gap-2">
              <label className={etiquette}>
                Début (vide : tout de suite)
                <input
                  type="datetime-local"
                  value={debut}
                  onChange={(e) => setDebut(e.target.value)}
                  className={champ}
                />
              </label>
              <label className={etiquette}>
                Durée
                <select value={heures} onChange={(e) => setHeures(Number(e.target.value))} className={champ}>
                  {DUREES.map(([h, libelle]) => (
                    <option key={h} value={h}>
                      {libelle}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={!ok} className="relief h-10 px-4">
                Voir avant de lancer
              </button>
            </div>
          </form>
        )}
        {arret.error && (
          <p role="alert" className="text-sm text-danger">
            {messageErreur(arret.error)}
          </p>
        )}
        <Table
          colonnes={[['Événement'], ['Effets'], ['Début'], ['Fin'], ['État'], ['Action', true]]}
          vide="Aucun événement pour l’instant."
          attente={!data}
          lignes={(data?.events ?? []).map((e) => [
            e.id,
            [
              <span key="t" className="font-semibold">
                {e.title}
              </span>,
              effets(e),
              <span key="d" className="whitespace-nowrap">
                {quand(e.startsAt)}
              </span>,
              <span key="f" className="whitespace-nowrap">
                {quand(e.cancelledAt !== null && e.cancelledAt < e.endsAt ? e.cancelledAt : e.endsAt)}
              </span>,
              <Pastille key="s" classe={ETATS[e.status].classe}>
                {ETATS[e.status].libelle}
              </Pastille>,
              e.status === 'upcoming' || e.status === 'active' ? (
                <button
                  key="a"
                  type="button"
                  disabled={arret.isPending}
                  onClick={() =>
                    arme === e.id
                      ? arret.mutate(
                          { methode: 'POST', url: `events/${e.id}/cancel` },
                          { onSettled: () => setArme(null) },
                        )
                      : setArme(e.id)
                  }
                  className={`${petitBouton} whitespace-nowrap ${arme === e.id ? 'bg-danger text-fond' : 'border border-encre/15 hover:bg-brume'}`}
                >
                  {arme === e.id ? 'Confirmer l’arrêt' : 'Arrêter'}
                </button>
              ) : null,
            ],
          ])}
        />
      </div>
    </Section>
  );
}
