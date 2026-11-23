import type { Grade } from '@france-tycoon/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { useAdminMoi } from '../api/admin.ts';
import { ErreurApi, messageErreur } from '../api/client.ts';
import { Icone } from '../hud/Icone.tsx';
import { Joueurs } from './Joueurs.tsx';
import { Territoires } from './Territoires.tsx';
import { VueEnsemble } from './VueEnsemble.tsx';

type IdVue = 'ensemble' | 'joueurs' | 'territoires' | 'triche' | 'config' | 'sauvegardes';

// Les 6 vues. `admin` : cachée au modérateur (le serveur refuse de toute façon). `etape` : pas encore construite.
type Vue = { id: IdVue; libelle: string; admin?: boolean; etape?: number };
const ENSEMBLE: Vue = { id: 'ensemble', libelle: 'Vue d’ensemble' };
const VUES: Vue[] = [
  ENSEMBLE,
  { id: 'joueurs', libelle: 'Joueurs' },
  { id: 'territoires', libelle: 'Territoires & OPA' },
  { id: 'triche', libelle: 'Anti-triche & logs', etape: 7 },
  { id: 'config', libelle: 'Live config & events', admin: true, etape: 6 },
  { id: 'sauvegardes', libelle: 'Sauvegardes & signalements', etape: 4 },
];

const GRADES: Record<Grade, string> = { admin: 'Admin', moderator: 'Modérateur' };

/** Page /admin : le serveur dit qui entre (GET /admin/me) ; l'écran ne montre que les vues du grade. */
export function Admin() {
  const { data, error, isPending } = useAdminMoi();

  useEffect(() => {
    document.title = 'Kadastr : admin';
  }, []);

  if (isPending) return <Seul titre="Chargement…" />;
  if (error) {
    const statut = error instanceof ErreurApi ? error.statut : 0;
    if (statut === 401)
      return (
        <Seul titre="Connecte-toi d’abord">Connecte-toi avec Google sur la carte, puis reviens sur cette page.</Seul>
      );
    return <Seul titre={statut === 403 ? 'Accès réservé' : 'Page indisponible'}>{messageErreur(error)}</Seul>;
  }
  return <Tableau pseudo={data.pseudo} grade={data.grade} />;
}

/** Message plein écran (chargement, refus), avec le chemin du retour. */
function Seul({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
      <Marque />
      <h1 className="text-2xl font-extrabold [font-stretch:112%]">{titre}</h1>
      {children && <p className="text-ardoise">{children}</p>}
      <a href="/" className="font-semibold underline underline-offset-4">
        Retour à la carte
      </a>
    </main>
  );
}

/** Même hexagone que favicon.svg. */
function Marque() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-[22px] shrink-0" aria-hidden="true">
        <path d="M16 4 27 10 26 22 16 28 6 22 5 10Z" fill="#ffd23f" />
      </svg>
      <span className="font-extrabold [font-stretch:112%]">Kadastr</span>
    </span>
  );
}

/** Menu fixe à gauche sur ordinateur, tiroir sur téléphone ; la vue choisie à droite. */
function Tableau({ pseudo, grade }: { pseudo: string; grade: Grade }) {
  const [id, setId] = useState<IdVue>('ensemble');
  const [menu, setMenu] = useState(false);
  const vues = VUES.filter((v) => grade === 'admin' || !v.admin);
  const vue = vues.find((v) => v.id === id) ?? ENSEMBLE;

  useEffect(() => {
    if (!menu) return;
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    addEventListener('keydown', touche);
    return () => removeEventListener('keydown', touche);
  }, [menu]);

  return (
    <div className="min-h-dvh md:pl-60">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-encre/10 bg-fond/95 px-2 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={menu}
          aria-controls="menu-admin"
          onClick={() => setMenu(true)}
          className="rounded-full p-2.5 text-ardoise hover:bg-brume hover:text-encre"
        >
          <Icone nom="menu" />
        </button>
        <Marque />
      </header>

      {menu && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenu(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}
      <nav
        id="menu-admin"
        aria-label="Vues du dashboard"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-encre/10 bg-surface transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none ${
          menu ? '' : 'max-md:invisible max-md:-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <Marque />
          <span className="ml-auto rounded-full bg-brume px-2 py-0.5 text-xs font-semibold text-ardoise">
            {GRADES[grade]}
          </span>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
          {vues.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                aria-current={v.id === vue.id ? 'page' : undefined}
                onClick={() => {
                  setId(v.id);
                  setMenu(false);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-150 ${
                  v.id === vue.id ? 'bg-brume text-encre' : 'text-ardoise hover:bg-brume/60 hover:text-encre'
                }`}
              >
                {v.libelle}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-encre/10 px-4 py-3 text-sm">
          <p className="truncate text-ardoise">{pseudo}</p>
          <a href="/" className="font-semibold underline underline-offset-4">
            Retour à la carte
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 md:px-8">
        <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.015em] [font-stretch:112%]">
          {vue.libelle}
        </h1>
        {vue.id === 'ensemble' ? (
          <VueEnsemble />
        ) : vue.id === 'joueurs' ? (
          <Joueurs moi={pseudo} grade={grade} />
        ) : vue.id === 'territoires' ? (
          <Territoires grade={grade} />
        ) : (
          <p className="mt-3 text-ardoise">Cette vue arrive à l’étape {vue.etape} du dashboard.</p>
        )}
      </main>
    </div>
  );
}
