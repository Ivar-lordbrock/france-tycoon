/** Icônes au trait (24 × 24, trait 1,8, bouts ronds), dessinées ici : pas de bibliothèque pour six dessins. */
const DESSINS = {
  hexagone: ['M12 3 20 7.5v9L12 21l-8-4.5v-9Z'],
  drapeau: ['M5 21V4M5 4h12l-2.5 4L17 12H5'],
  cloche: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9', 'M10 20.5a2 2 0 0 0 4 0'],
  coupe: ['M8 4h8v6a4 4 0 0 1-8 0Z', 'M8 6H5a3 3 0 0 0 3 5M16 6h3a3 3 0 0 1-3 5M12 14v4M8 21h8M10 18h4'],
  globe: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'],
  gemme: ['M6 3h12l3 6-9 12L3 9Z', 'M3 9h18'],
  fermer: ['M6 6l12 12M18 6 6 18'],
  chevron: ['m6 9 6 6 6-6'],
  coche: ['m5 12.5 4.5 4.5L19 7'],
} as const;

export type NomIcone = keyof typeof DESSINS;

export function Icone({ nom, className = 'size-5' }: { nom: NomIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 fill-none stroke-current ${className}`}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {DESSINS[nom].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** La pièce de tycoon : un rond jaune avec son bord en dessous, comme une vraie pièce. */
export function Piece({ className = 'size-5 text-xs' }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-surligneur font-extrabold text-fond shadow-[inset_0_-2px_0_#c9a21a] ${className}`}
      aria-hidden="true"
    >
      ₮
    </span>
  );
}
