import type { MoiReponse } from '@france-tycoon/shared';
import { type CSSProperties, type ReactNode, useEffect, useId } from 'react';
import { useFileChantiers } from '../api/batiments.ts';
import { useMoi } from '../api/compte.ts';
import { useQuetes } from '../api/quetes.ts';
import { Profil } from '../compte/Compte.tsx';
import { useCarte, type Volet } from '../etat/carte.ts';
import { nomRang } from '../panels/classement-texte.ts';
import { MesTerritoires } from '../panels/MesTerritoires.tsx';
import { SelecteurZones } from '../panels/SelecteurZones.tsx';
import { CentreMessages } from './CentreMessages.tsx';
import { ChantierEnCours } from './ChantierEnCours.tsx';
import { Classement } from './Classement.tsx';
import { Icone, type NomIcone } from './Icone.tsx';
import { QuetesDuJour } from './QuetesDuJour.tsx';

interface Onglet {
  cle: Volet;
  libelle: string;
  icone: NomIcone;
  tuto?: string;
  /** Sur ordinateur, les zones sont dans la barre de recherche. */
  telephone?: true;
}

const ONGLETS: Onglet[] = [
  { cle: 'communes', libelle: 'Communes', icone: 'hexagone' },
  { cle: 'quetes', libelle: 'Quêtes', icone: 'drapeau', tuto: 'quests-button' },
  { cle: 'messages', libelle: 'Messages', icone: 'cloche' },
  { cle: 'classement', libelle: 'Classement', icone: 'coupe', tuto: 'leaderboard-button' },
  { cle: 'zones', libelle: 'Zones', icone: 'globe', tuto: 'zone-selector', telephone: true },
];

const TITRES: Record<Volet, string> = {
  communes: 'Mes communes',
  quetes: 'Quêtes du jour',
  messages: 'Messages',
  classement: 'Classement',
  zones: 'Zones',
  profil: 'Mon profil',
};

/** Barre du bas : un onglet ouvre sa fenêtre juste au-dessus, une seule à la fois ; le même onglet la referme. */
export function Dock() {
  const { data: moi } = useMoi();
  const volet = useCarte((etat) => etat.volet);
  const basculerVolet = useCarte((etat) => etat.basculerVolet);
  // Lues dès l'arrivée (pas seulement fenêtre ouverte) pour les pastilles.
  const { data: quetes } = useQuetes(Boolean(moi));
  const { data: file } = useFileChantiers(Boolean(moi));
  const onglets = moi ? ONGLETS : ONGLETS.filter((o) => o.telephone);

  useEffect(() => {
    if (!volet) return;
    const fermer = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input, textarea, select'))
        basculerVolet(null);
    };
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [volet, basculerVolet]);

  const pastilles: Partial<Record<Volet, { n: number; fond: string; sens: string }>> = {
    communes: { n: file?.works.length ?? 0, fond: 'bg-encre', sens: 'chantier en cours' },
    quetes: {
      n: quetes?.quests.filter((q) => q.completedAt !== null && q.claimedAt === null).length ?? 0,
      fond: 'bg-surligneur',
      sens: 'à réclamer',
    },
    messages: { n: moi?.unreadNotifications ?? 0, fond: 'bg-alerte', sens: 'non lus' },
  };
  // La pointe de la fenêtre vise son onglet : 4 onglets de 90 px (+ 2 px d'écart), barre centrée sous la fenêtre de 420 px.
  const rang = ONGLETS.findIndex((o) => o.cle === volet && !o.telephone);

  return (
    <>
      {volet && (moi || volet === 'zones') && (
        <Fenetre
          titre={TITRES[volet]}
          sous={moi ? sousTitre(volet, moi) : null}
          bec={rang >= 0 ? 62 + 92 * rang : null}
        >
          <Contenu volet={volet} moi={moi ?? null} onChoisi={() => basculerVolet(null)} />
        </Fenetre>
      )}
      <nav
        aria-label="Menu du jeu"
        className={`panneau pointer-events-auto flex gap-0.5 rounded-3xl p-1.5 max-md:-mx-3 max-md:justify-around max-md:rounded-b-none max-md:px-1 max-md:pb-[max(10px,env(safe-area-inset-bottom))] md:absolute md:bottom-7 md:left-1/2 md:-translate-x-1/2 ${
          moi ? '' : 'md:hidden'
        }`}
      >
        {onglets.map((o) => {
          const pastille = pastilles[o.cle];
          const actif = volet === o.cle;
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => basculerVolet(o.cle)}
              aria-expanded={actif}
              aria-controls="fenetre"
              data-tuto={o.tuto}
              className={`relative flex w-[90px] flex-col items-center gap-1 rounded-[18px] pt-[9px] pb-2 text-xs font-semibold max-md:w-auto max-md:flex-1 max-md:text-[11px] ${
                o.telephone ? 'md:hidden' : ''
              } ${actif ? 'text-encre md:bg-brume' : 'text-ardoise hover:text-encre'}`}
            >
              <Icone nom={o.icone} />
              {o.libelle}
              {pastille && pastille.n > 0 && (
                <span
                  className={`absolute top-1 left-[calc(50%+7px)] h-[18px] min-w-[18px] rounded-[9px] px-[5px] text-center text-[11px] leading-[18px] font-extrabold text-fond tabular-nums ${pastille.fond}`}
                >
                  {pastille.n > 99 ? '99+' : pastille.n}
                  <span className="sr-only"> {pastille.sens}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function sousTitre(volet: Volet, moi: MoiReponse): string | null {
  const territoires = `${moi.territories.owned} / ${moi.territories.max} territoires`;
  if (volet === 'communes') return territoires;
  if (volet === 'profil') return `${nomRang(moi.rankLevel)}, ${territoires}`;
  return null;
}

function Contenu({ volet, moi, onChoisi }: { volet: Volet; moi: MoiReponse | null; onChoisi: () => void }) {
  const id = useId();
  if (volet === 'zones') return <SelecteurZones onChoisi={onChoisi} />;
  if (!moi) return null;
  switch (volet) {
    case 'communes':
      return (
        <>
          <ChantierEnCours possede={moi.territories.owned} onChoisi={onChoisi} />
          <MesTerritoires id={id} onChoisi={onChoisi} />
        </>
      );
    case 'quetes':
      return <QuetesDuJour id={id} />;
    case 'messages':
      return <CentreMessages id={id} nonLus={moi.unreadNotifications} onChoisi={onChoisi} />;
    case 'classement':
      return <Classement id={id} onChoisi={onChoisi} />;
    case 'profil':
      return <Profil moi={moi} />;
  }
}

/** Fenêtre posée au-dessus de la barre du bas (ordinateur) ou en bas de l'écran, sous le pouce (téléphone). */
function Fenetre({
  titre,
  sous,
  bec,
  children,
}: {
  titre: string;
  sous: string | null;
  bec: number | null;
  children: ReactNode;
}) {
  const id = useId();
  const basculerVolet = useCarte((etat) => etat.basculerVolet);
  return (
    <section
      id="fenetre"
      aria-labelledby={`${id}-titre`}
      style={bec === null ? undefined : ({ '--bec': `${bec}px` } as CSSProperties)}
      className="fenetre panneau entree-fenetre pointer-events-auto relative flex min-h-0 flex-col rounded-[28px] max-md:max-h-[60dvh] md:absolute md:bottom-[116px] md:left-1/2 md:max-h-[calc(100dvh-14rem)] md:w-[420px] md:-translate-x-1/2"
    >
      <header className="flex items-start justify-between gap-3 px-[18px] pt-[18px] pb-2">
        <div className="min-w-0">
          <h2 id={`${id}-titre`} className="text-xl font-extrabold [font-stretch:110%]">
            {titre}
          </h2>
          {sous && <p className="mt-0.5 text-[13px] text-ardoise tabular-nums">{sous}</p>}
        </div>
        <BoutonFermer libelle="Fermer la fenêtre" onClick={() => basculerVolet(null)} />
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-1.5 pb-3">{children}</div>
    </section>
  );
}

/** Rond discret en haut à droite d'une fenêtre ou de la fiche. */
export function BoutonFermer({
  libelle,
  onClick,
  className = '',
}: {
  libelle: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className={`grid size-[34px] shrink-0 place-items-center rounded-full bg-white/[0.06] text-ardoise hover:bg-white/10 hover:text-encre ${className}`}
    >
      <Icone nom="fermer" className="size-4" />
    </button>
  );
}
