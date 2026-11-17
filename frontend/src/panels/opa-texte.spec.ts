import type { DevisOpa, FicheCommune, MoiReponse, Opa } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import {
  type ContexteOpa,
  confirmationAcceptation,
  confirmationDefense,
  confirmationLancement,
  confirmationRetrait,
  messageApres,
  phraseOpaEnCours,
  raisonOpa,
  tempsRestant,
} from './opa-texte.ts';

const maintenant = 1_800_000_000;
const jour = 86_400;
const espaces = (texte: string | null) => texte?.replace(/\s/g, ' ');

const fiche = {
  shieldUntil: null,
  owner: { pseudo: 'Bruno', markerColor: '#000000', avatarUrl: null, isMe: false },
} as Pick<FicheCommune, 'shieldUntil' | 'owner'>;
const moi = {
  user: { createdAt: maintenant - 30 * jour },
  wallet: { cash: 20_000, gems: 0 },
  territories: { owned: 3, max: 4 },
} as MoiReponse;
const contexte: ContexteOpa = { fiche, moi, offre: 32_700, mesOpaLancees: 0, maintenant };

const opa = {
  id: 7,
  territory: { insee: '01001', name: 'L’Abergement-Clémenciat', zone: 'MET' },
  attacker: { pseudo: 'Alice', markerColor: '#ff0000' },
  defender: { pseudo: 'Bruno', markerColor: '#0000ff' },
  role: 'defender',
  territoryValue: 21_800,
  offerAmount: 32_700,
  defenseCost: 7_700,
  breakFee: 1_700,
  status: 'pending',
  createdAt: maintenant - 3_600,
  expiresAt: maintenant + 23 * 3_600,
  resolvedAt: null,
} satisfies Opa;

describe('pourquoi pas d’OPA', () => {
  it('rien à dire sur une commune libre ou à soi', () => {
    expect(raisonOpa('FORBIDDEN', contexte)).toBeNull();
  });

  it('protections de la cible', () => {
    expect(raisonOpa('CAPITAL_IMMUNE', contexte)).toBe(
      'C’est la capitale de Bruno : une capitale ne peut pas être visée par une OPA.',
    );
    expect(raisonOpa('SHIELD_ACTIVE', { ...contexte, fiche: { ...fiche, shieldUntil: maintenant + 11 * 3_600 } })).toBe(
      'Protégée par un bouclier encore 11 h.',
    );
    expect(raisonOpa('NEWBIE_PROTECTION', contexte)).toBe(
      'Bruno vient d’arriver : les nouveaux joueurs sont protégés pendant 3 jours.',
    );
    expect(raisonOpa('TAKEOVER_LIMIT', contexte)).toBe('Bruno subit déjà 2 OPA.');
  });

  it('ce qui dépend de moi', () => {
    const jeune = { ...moi, user: { ...moi.user, createdAt: maintenant - 5 * jour } };
    expect(raisonOpa('NEWBIE_PROTECTION', { ...contexte, moi: jeune })).toBe(
      'Ton compte doit avoir 7 jours pour lancer une OPA : encore 2 j.',
    );
    expect(raisonOpa('TAKEOVER_LIMIT', { ...contexte, mesOpaLancees: 1 })).toBe(
      'Tu mènes déjà une OPA : attends qu’elle soit terminée.',
    );
    expect(raisonOpa('TERRITORY_LIMIT_REACHED', contexte)).toBe('Tu as déjà 3 territoires sur 4.');
    expect(espaces(raisonOpa('INSUFFICIENT_FUNDS', contexte))).toBe('Il te manque 12 700 ₮ pour l’offre (32 700 ₮).');
    expect(raisonOpa('UNAUTHENTICATED', { ...contexte, moi: null })).toBe('Connecte-toi pour lancer une OPA.');
  });
});

describe('textes des OPA', () => {
  it('temps restant', () => {
    expect(tempsRestant(maintenant + 23 * 3_600 + 12 * 60, maintenant)).toBe('23 h 12');
    expect(tempsRestant(maintenant + 24 * 3_600 - 20, maintenant)).toBe('23 h 59');
    expect(tempsRestant(maintenant + 30, maintenant)).toBe('quelques secondes');
    expect(tempsRestant(maintenant - 5, maintenant)).toBe('quelques secondes');
  });

  it('confirmations : les montants figés par le serveur', () => {
    const devis: DevisOpa = {
      territoryValue: 21_800,
      offerAmount: 32_700,
      defenseCost: 7_700,
      breakFee: 1_700,
      eligible: true,
      reasons: [],
    };
    const lancement = confirmationLancement(devis, 50_000, 'Bruno');
    expect(lancement.lignes.map(([terme, valeur]) => [terme, espaces(valeur)])).toEqual([
      ['Offre, bloquée 24 h', '32 700 ₮'],
      ['Il te restera', '17 300 ₮'],
      ['Valeur de la commune', '21 800 ₮'],
    ]);
    expect(espaces(lancement.note)).toContain('tu récupères ton offre moins 1 700 ₮ d’indemnité');

    expect(confirmationDefense(opa, 10_000).lignes.map(([, v]) => espaces(v))).toEqual([
      '7 700 ₮',
      '2 300 ₮',
      '+1 700 ₮',
      '+7 700 ₮',
    ]);
    expect(confirmationAcceptation(opa, 218).note).toBe(
      'L’Abergement-Clémenciat passe à Alice, avec ses bâtiments et ses chantiers en cours.',
    );
    expect(confirmationRetrait({ ...opa, role: 'attacker' }).lignes.map(([, v]) => espaces(v))).toEqual([
      '31 000 ₮',
      '1 700 ₮',
    ]);
  });

  it('message après chaque issue', () => {
    expect(messageApres(opa)).toBe('OPA lancée sur L’Abergement-Clémenciat. Bruno a 24 h pour réagir.');
    expect(espaces(messageApres({ ...opa, status: 'defended' }))).toBe(
      'L’Abergement-Clémenciat est défendue : bouclier de 3 j et 1 700 ₮ d’indemnité pour toi.',
    );
    expect(espaces(messageApres({ ...opa, status: 'accepted' }))).toBe(
      'L’Abergement-Clémenciat est vendue à Alice pour 32 700 ₮.',
    );
    expect(espaces(messageApres({ ...opa, status: 'cancelled', role: 'attacker' }))).toBe(
      'Offre retirée : 31 000 ₮ te sont rendus.',
    );
  });

  it('bandeau « Mes OPA » selon mon rôle', () => {
    expect(espaces(phraseOpaEnCours(opa, maintenant))).toBe('Alice offre 32 700 ₮. Il te reste 23 h pour réagir.');
    expect(espaces(phraseOpaEnCours({ ...opa, role: 'attacker' }, maintenant))).toBe(
      'Ton offre : 32 700 ₮. Bruno a encore 23 h pour réagir.',
    );
  });
});
