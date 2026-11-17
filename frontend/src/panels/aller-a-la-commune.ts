import type { ZoneCode } from '@france-tycoon/shared';
import type { QueryClient } from '@tanstack/react-query';
import { optionsFiche } from '../api/compte.ts';
import { type OngletFiche, useCarte } from '../etat/carte.ts';
import { allerVersCentre } from '../map/navigation.ts';

/**
 * Ouvre la fiche d'une commune (sur l'onglet voulu) et amène la carte dessus.
 * La zone sert à changer de vue tout de suite ; sans elle, on attend la fiche.
 */
export async function allerALaCommune(
  client: QueryClient,
  insee: string,
  { onglet = 'infos', zone }: { onglet?: OngletFiche; zone?: ZoneCode } = {},
) {
  const { definirSelection, definirVueActive } = useCarte.getState();
  definirSelection(insee, onglet);
  if (zone) definirVueActive(zone);
  // Le centre de la commune est dans sa fiche, qu'on lit de toute façon pour l'afficher.
  const fiche = await client.fetchQuery(optionsFiche(insee)).catch(() => null);
  if (!fiche) return;
  if (!zone) definirVueActive(fiche.zone);
  const { carte } = useCarte.getState();
  if (carte) allerVersCentre(carte, fiche.center, fiche.zone);
}
