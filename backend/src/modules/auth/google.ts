import { OAuth2Client } from 'google-auth-library';

export interface IdentiteGoogle {
  sub: string;
  email: string;
  emailVerifie: boolean;
  nom?: string;
  photo?: string;
}

/** Vérifie un jeton d'identité Google ; remplaçable dans les tests. */
export type VerifierGoogle = (credential: string) => Promise<IdentiteGoogle>;

/**
 * Vérification officielle (`verifyIdToken`) : signature Google, expiration, et audience
 * = notre ID client (un jeton émis pour un autre site est refusé).
 */
export function creerVerifierGoogle(clientId: string): VerifierGoogle {
  const client = new OAuth2Client({ clientId });
  return async (credential) => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const contenu = ticket.getPayload();
    if (!contenu?.sub || !contenu.email) throw new Error('jeton Google sans identifiant ni e-mail');
    return {
      sub: contenu.sub,
      email: contenu.email,
      emailVerifie: contenu.email_verified === true,
      nom: contenu.name ?? contenu.given_name,
      photo: contenu.picture,
    };
  };
}
