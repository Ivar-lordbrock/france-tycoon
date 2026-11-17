import type { Chantier, FileConstruction } from '@france-tycoon/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useFileChantiers } from '../api/batiments.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';
import { avancement, minuteur } from '../panels/batiments-texte.ts';

/** Quand un chantier quitte la file (fini ou arrêté), le profil (revenu, résumé) et sa fiche sont relus. */
function useSuiviChantiers(file: FileConstruction | undefined) {
  const client = useQueryClient();
  const avant = useRef<Chantier[] | null>(null);
  useEffect(() => {
    const precedents = avant.current;
    avant.current = file?.works ?? null;
    if (!precedents || !file) return;
    const partis = precedents.filter(
      (p) => !file.works.some((w) => w.buildingId === p.buildingId && w.targetLevel === p.targetLevel),
    );
    if (partis.length === 0) return;
    void client.invalidateQueries({ queryKey: ['moi'], exact: true });
    void client.invalidateQueries({ queryKey: ['moi', 'territoires'] });
    for (const p of partis) void client.invalidateQueries({ queryKey: ['fiche', p.territoryInsee] });
  }, [file, client]);
}

/** Barre du haut : chantier en cours et temps restant ; un clic ouvre la commune sur ses bâtiments. */
export function ChantierEnCours({ possede }: { possede: number }) {
  const { data: file } = useFileChantiers(true);
  const maintenant = useMaintenant(1_000);
  const client = useQueryClient();
  useSuiviChantiers(file);

  if (!file || possede === 0) return null;
  if (file.works.length === 0) {
    return (
      <p className="border-t border-encre/10 px-3 py-2 text-sm text-ardoise">
        Aucun chantier en cours : ta file est libre.
      </p>
    );
  }

  return (
    <ul aria-label="Chantiers en cours">
      {file.works.map((w) => {
        const restant = w.endsAt - maintenant;
        return (
          <li key={w.buildingId}>
            <button
              type="button"
              onClick={() => void allerALaCommune(client, w.territoryInsee, { onglet: 'batiments' })}
              className="block w-full border-t border-encre/10 px-3 py-2 text-left hover:bg-brume/60"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">
                  <span className="font-semibold">
                    {w.name} niv. {w.targetLevel}
                  </span>{' '}
                  <span className="text-ardoise">· {w.territoryName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {restant > 0 ? minuteur(restant) : 'Terminé'}
                </span>
              </span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-brume" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-encre"
                  style={{ width: `${avancement(w.startedAt, w.endsAt, maintenant) * 100}%` }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
