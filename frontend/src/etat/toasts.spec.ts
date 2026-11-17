import { beforeEach, describe, expect, it } from 'vitest';
import { ajouterToast, TOASTS_MAX, useToasts } from './toasts.ts';

const textes = () => useToasts.getState().toasts.map((t) => t.texte);

describe('petits messages', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it('3 au plus : le plus ancien laisse sa place', () => {
    for (const texte of ['un', 'deux', 'trois', 'quatre']) ajouterToast({ texte, ton: 'info' });
    expect(textes()).toEqual(['deux', 'trois', 'quatre']);
    expect(textes()).toHaveLength(TOASTS_MAX);
  });

  it('le même texte n’est pas répété, et on peut fermer un message', () => {
    ajouterToast({ texte: 'Le serveur ne répond pas.', ton: 'erreur' });
    ajouterToast({ texte: 'Le serveur ne répond pas.', ton: 'erreur' });
    expect(textes()).toEqual(['Le serveur ne répond pas.']);

    const [toast] = useToasts.getState().toasts;
    useToasts.getState().retirer(toast?.id ?? 0);
    expect(textes()).toEqual([]);
  });
});
