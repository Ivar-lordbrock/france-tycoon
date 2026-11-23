import { FUSEAU_JEU, type Reglages } from '@france-tycoon/shared';
import { useState } from 'react';
import { useEtatSite } from '../api/site.ts';
import { Icone } from './Icone.tsx';

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

/** Un message fermé reste fermé tant que son contenu (la clé) ne change pas. */
function useFermeture(cle: string) {
  const [fermee, setFermee] = useState(() => lire(cle));
  const fermer = (contenu: string) => {
    setFermee(contenu);
    try {
      localStorage.setItem(cle, contenu);
    } catch {
      // Stockage bloqué : il restera fermé jusqu'au rechargement.
    }
  };
  return [fermee, fermer] as const;
}

const pct = (p: number) => (p > 100 && p % 100 === 0 ? `× ${p / 100}` : `${p > 100 ? '+' : '−'}${Math.abs(p - 100)} %`);

/** « Revenus × 2 · Communes −25 % » : seulement ce qui change (100 % = normal). */
export function effetsReglages(r: Reglages): string {
  const lignes: [string, number][] = [
    ['Revenus', r.income],
    ['Prix des communes', r.price],
    ['Coût des bâtiments', r.building],
  ];
  return lignes
    .filter(([, p]) => p !== 100)
    .map(([nom, p]) => `${nom} ${pct(p)}`)
    .join(' · ');
}

const jusqua = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_JEU,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Messages de l'équipe, en haut à droite : la maintenance (on regarde sans agir, impossible à fermer),
 * la bannière d'annonce et les événements en cours (fermés, ils reviennent seulement s'ils changent).
 */
export function BandeauSite() {
  const { data } = useEtatSite();
  const [fermee, fermer] = useFermeture('kadastr.banniere-fermee');
  const [evenementsFermes, fermerEvenements] = useFermeture('kadastr.evenements-fermes');
  if (!data) return null;
  const banniere = data.banner && data.banner.text !== fermee ? data.banner : null;
  const cleEvenements = data.events.map((e) => `${e.title}@${e.endsAt}`).join('|');
  const evenements = cleEvenements !== '' && cleEvenements !== evenementsFermes ? data.events : [];
  if (!data.maintenance && !banniere && evenements.length === 0) return null;

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      {data.maintenance && (
        <div role="status" className="panneau flex items-start gap-2.5 px-3.5 py-2.5 text-sm text-encre">
          <Icone nom="drapeau" className="mt-0.5 size-[18px] text-alerte" />
          <p className="min-w-0 flex-1">
            <strong className="block">Maintenance en cours</strong>
            {data.maintenance} Tu peux regarder la carte, mais pas acheter ni construire pour l’instant.
          </p>
        </div>
      )}
      {banniere && (
        <div role="status" className="panneau flex items-start gap-2.5 py-2.5 pr-1.5 pl-3.5 text-sm text-encre">
          <Icone nom="cloche" className="mt-0.5 size-[18px] text-surligneur" />
          <p className="min-w-0 flex-1">{banniere.text}</p>
          <Fermer libelle="Fermer l’annonce" onClick={() => fermer(banniere.text)} />
        </div>
      )}
      {evenements.length > 0 && (
        <div role="status" className="panneau flex items-start gap-2.5 py-2.5 pr-1.5 pl-3.5 text-sm text-encre">
          <Icone nom="eclair" className="mt-0.5 size-[18px] text-surligneur" />
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
            {evenements.map((e) => (
              <li key={`${e.title}@${e.endsAt}`}>
                <strong className="block">{e.title}</strong>
                {effetsReglages(e)}
                <span className="block text-ardoise">Jusqu’au {jusqua.format(e.endsAt * 1000)}</span>
              </li>
            ))}
          </ul>
          <Fermer libelle="Fermer l’événement" onClick={() => fermerEvenements(cleEvenements)} />
        </div>
      )}
    </div>
  );
}

function Fermer({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="grid size-8 shrink-0 place-items-center rounded-full text-ardoise hover:bg-brume hover:text-encre"
    >
      <Icone nom="fermer" className="size-4" />
    </button>
  );
}
