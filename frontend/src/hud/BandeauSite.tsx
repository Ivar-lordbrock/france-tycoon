import { useState } from 'react';
import { useEtatSite } from '../api/site.ts';
import { Icone } from './Icone.tsx';

const CLE = 'kadastr.banniere-fermee';

function lireFermee(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

/**
 * Messages de l'équipe, en haut à droite : la maintenance (on regarde sans agir, impossible à fermer) et
 * la bannière d'annonce (fermée, elle revient seulement si son texte change).
 */
export function BandeauSite() {
  const { data } = useEtatSite();
  const [fermee, setFermee] = useState(lireFermee);
  if (!data) return null;
  const banniere = data.banner && data.banner.text !== fermee ? data.banner : null;
  if (!data.maintenance && !banniere) return null;

  const fermer = (texte: string) => {
    setFermee(texte);
    try {
      localStorage.setItem(CLE, texte);
    } catch {
      // Stockage bloqué : elle restera fermée jusqu'au rechargement.
    }
  };

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
          <button
            type="button"
            onClick={() => fermer(banniere.text)}
            aria-label="Fermer l’annonce"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ardoise hover:bg-brume hover:text-encre"
          >
            <Icone nom="fermer" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
