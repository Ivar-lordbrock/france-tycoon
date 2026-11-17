import { useEffect, useState } from 'react';

/** Heure actuelle en secondes Unix (comme l'API), remise à jour toutes les `periodeMs`. */
export function useMaintenant(periodeMs: number): number {
  const [maintenant, setMaintenant] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Math.floor(Date.now() / 1000)), periodeMs);
    return () => window.clearInterval(minuterie);
  }, [periodeMs]);
  return maintenant;
}
