import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { useMesOpaEnCours } from '../api/opa.ts';
import { useMaintenant } from '../etat/horloge.ts';
import { allerALaCommune } from '../panels/aller-a-la-commune.ts';
import { phraseOpaEnCours } from '../panels/opa-texte.ts';

/**
 * Mes OPA en cours, sous la barre du haut : celles qui me visent d'abord (24 h pour réagir),
 * puis celles que j'ai lancées. Un clic ouvre la fiche, où l'on répond.
 */
export function MesOpa() {
  const id = useId();
  const client = useQueryClient();
  const { data: opas } = useMesOpaEnCours(true);
  const maintenant = useMaintenant(1_000);
  const echue = opas?.some((o) => o.expiresAt <= maintenant) ?? false;

  // Une OPA arrive au bout de ses 24 h : le serveur la résout à la lecture, on relit.
  useEffect(() => {
    if (!echue) return;
    void Promise.all([
      client.invalidateQueries({ queryKey: ['moi'] }),
      client.invalidateQueries({ queryKey: ['fiche'] }),
      client.invalidateQueries({ queryKey: ['carte', 'communes'] }),
    ]);
  }, [echue, client]);

  if (!opas || opas.length === 0) return null;
  const tri = [...opas].sort((a, b) =>
    a.role === b.role ? a.expiresAt - b.expiresAt : a.role === 'defender' ? -1 : 1,
  );

  return (
    <section aria-labelledby={`${id}-titre`} className="panneau pointer-events-auto shrink-0 overflow-hidden">
      <h2 id={`${id}-titre`} className="sr-only">
        Mes OPA en cours
      </h2>
      <ul className="flex flex-col divide-y divide-encre/10">
        {tri.map((opa) => (
          <li key={opa.id}>
            <button
              type="button"
              onClick={() => void allerALaCommune(client, opa.territory.insee, { zone: opa.territory.zone })}
              className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm ${
                opa.role === 'defender' ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-brume/60'
              }`}
            >
              <span className={`font-semibold ${opa.role === 'defender' ? 'text-orange-800' : ''}`}>
                {opa.role === 'defender' ? `OPA reçue sur ${opa.territory.name}` : `Ton OPA sur ${opa.territory.name}`}
              </span>
              <span className="tabular-nums">{phraseOpaEnCours(opa, maintenant)}</span>
              <span className="text-xs font-semibold text-ardoise underline">
                {opa.role === 'defender' ? 'Réagir' : 'Voir'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
