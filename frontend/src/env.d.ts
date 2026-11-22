/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Modèle d'URL des tuiles (`{z}/{x}/{y}`), voir docs/02 « Fonds de carte ». */
  readonly VITE_TILE_URL?: string;
  /** Mention obligatoire du fournisseur de tuiles (HTML autorisé). */
  readonly VITE_TILE_ATTRIBUTION?: string;
  /** « Donner mon avis » : lien d'un formulaire (https://…) ou adresse e-mail. Vide = lien caché. */
  readonly VITE_AVIS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Ce que le jeu utilise de Google Identity Services (https://accounts.google.com/gsi/client). */
interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (options: { client_id: string; callback: (reponse: { credential: string }) => void }) => void;
        renderButton: (
          parent: HTMLElement,
          options: {
            theme?: 'outline' | 'filled_blue';
            size?: 'large' | 'medium';
            text?: 'signin_with';
            locale?: string;
          },
        ) => void;
      };
    };
  };
}
