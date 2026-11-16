/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Modèle d'URL des tuiles (`{z}/{x}/{y}`), voir docs/02 « Fonds de carte ». */
  readonly VITE_TILE_URL?: string;
  /** Mention obligatoire du fournisseur de tuiles (HTML autorisé). */
  readonly VITE_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
