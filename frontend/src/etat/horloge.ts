import { useEffect, useState } from 'react';

/** Heure actuelle en millisecondes, remise à jour toutes les `periodeMs` (argent qui monte, minuteurs). */
export function useMaintenantMs(periodeMs: number): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), periodeMs);
    return () => window.clearInterval(minuterie);
  }, [periodeMs]);
  return maintenant;
}

/** Heure actuelle en secondes Unix (comme l'API), remise à jour toutes les `periodeMs`. */
export function useMaintenant(periodeMs: number): number {
  return Math.floor(useMaintenantMs(periodeMs) / 1000);
}
