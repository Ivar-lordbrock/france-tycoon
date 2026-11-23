/**
 * Où va « Donner mon avis » : le réglage `VITE_AVIS_URL` accepte le lien d'un formulaire (https://…)
 * ou une adresse e-mail (avec ou sans `mailto:`). Sans réglage valable, le lien n'est pas affiché.
 */
export function lienAvis(valeur: string | undefined): string | null {
  const v = valeur?.trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(v)) return v;
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(v)) {
    return `mailto:${v}?subject=${encodeURIComponent('Mon avis sur Kadastr')}`;
  }
  return null;
}

export const AVIS = lienAvis(import.meta.env.VITE_AVIS_URL);

/** Petits liens : « Donner mon avis », la feuille de route (/roadmap) et les pages légales (`public/legal.html`, nouvel onglet). */
export function LiensInfos({ className = '' }: { className?: string }) {
  // Au doigt : 44 px de haut.
  const lien = 'hover:text-encre hover:underline pointer-coarse:py-3.5';
  return (
    <nav
      aria-label="Informations"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ardoise ${className}`}
    >
      {AVIS && (
        <a href={AVIS} target="_blank" rel="noopener" className={`font-semibold text-encre ${lien}`}>
          Donner mon avis
        </a>
      )}
      <a href="/roadmap" className={lien}>
        Feuille de route
      </a>
      <a href="/legal.html#regles" target="_blank" rel="noopener" className={lien}>
        Règles
      </a>
      <a href="/legal.html#confidentialite" target="_blank" rel="noopener" className={lien}>
        Confidentialité
      </a>
      <a href="/legal.html#mentions" target="_blank" rel="noopener" className={lien}>
        Mentions légales
      </a>
      <a href="/legal.html#sources" target="_blank" rel="noopener" className={lien}>
        Sources
      </a>
    </nav>
  );
}
