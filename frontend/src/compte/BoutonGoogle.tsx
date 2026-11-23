import { useEffect, useRef, useState } from 'react';

const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';
let chargement: Promise<void> | null = null;

/** Charge Google Identity Services une seule fois. */
function chargerGoogle(): Promise<void> {
  chargement ??= new Promise<void>((fin, echec) => {
    const script = document.createElement('script');
    script.src = SCRIPT_GOOGLE;
    script.async = true;
    script.onload = () => fin();
    script.onerror = () => {
      chargement = null;
      echec(new Error('Google ne répond pas'));
    };
    document.head.append(script);
  });
  return chargement;
}

/** Bouton officiel « Se connecter avec Google » : Google renvoie un jeton d'identité, vérifié par le serveur. */
export function BoutonGoogle({ clientId, onJeton }: { clientId: string; onJeton: (jeton: string) => void }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const rappel = useRef(onJeton);
  rappel.current = onJeton;
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    chargerGoogle()
      .then(() => {
        const id = window.google?.accounts.id;
        if (annule || !id || !conteneur.current) return;
        id.initialize({ client_id: clientId, callback: (r) => rappel.current(r.credential) });
        id.renderButton(conteneur.current, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'fr' });
      })
      .catch(() => {
        if (!annule) setErreur(true);
      });
    return () => {
      annule = true;
    };
  }, [clientId]);

  if (erreur) return <p className="text-sm text-ardoise">Connexion Google indisponible pour le moment.</p>;
  // Le cadre de Google est clair : sans ce réglage, le thème sombre de la page lui met un fond blanc.
  return <div ref={conteneur} className="min-h-10 [color-scheme:light]" />;
}
