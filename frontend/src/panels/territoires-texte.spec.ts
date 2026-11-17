import type { FicheCommune, MoiReponse, MonTerritoire } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import {
  apercuAchat,
  apercuVente,
  detailsTerritoire,
  duree,
  estAMoi,
  pertesVente,
  raisonVente,
} from './territoires-texte.ts';

// Village 01001 (docs/05) : V0 = 21 800 ₮, sol 218 ₮/h ; Résidence niveau 1 : 4 430 ₮, 295 ₮/h.
const fiche = {
  insee: '01001',
  name: 'L’Abergement-Clémenciat',
  baseValue: 21_800,
  totalValue: 21_800,
  incomePerHour: 218,
  state: 'free',
  owner: null,
  buildings: [],
  actions: { canBuy: true, buyPrice: 21_800, buyReasons: [], canSell: false, sellPrice: null, sellReasons: [] },
} as unknown as FicheCommune;

const moi = { wallet: { cash: 30_000, gems: 0 }, territories: { owned: 0, max: 4 } } as MoiReponse;
const espace = /\s/g; // Intl sépare les milliers par une espace fine insécable

describe('aperçus de l’achat et de la vente', () => {
  it('achat : prix, cash restant, revenu, bouclier 12 h, temps pour se rembourser', () => {
    expect(apercuAchat(fiche, moi)).toEqual({
      prix: 21_800,
      resteCash: 8_200,
      revenuParHeure: 218,
      retour: 100 * 3_600,
      bouclier: 12 * 3_600,
      territoires: { apres: 1, max: 4 },
    });
    expect(apercuAchat({ ...fiche, incomePerHour: 0 }, moi).retour).toBeNull();
  });

  it('vente : le prix calculé par le serveur, sinon 70 % de la valeur arrondis à la centaine', () => {
    const maCommune = {
      ...fiche,
      state: 'mine',
      totalValue: 26_230,
      incomePerHour: 513,
      buildings: [
        { id: 1, typeCode: 'residence', name: 'Résidence', level: 1, targetLevel: null, worksEndsAt: null },
        { id: 2, typeCode: 'commerce', name: 'Commerce', level: 0, targetLevel: 1, worksEndsAt: 9 },
      ],
      actions: { ...fiche.actions, canSell: true, sellPrice: 18_300 },
    } as FicheCommune;

    expect(apercuVente(maCommune)).toEqual({
      montant: 18_300,
      valeur: 26_230,
      batiments: 2,
      chantiers: 1,
      revenuPerdu: 513,
    });
    expect(apercuVente({ ...maCommune, actions: { ...maCommune.actions, sellPrice: null } }).montant).toBe(18_300);
  });

  it('dit ce que la vente détruit', () => {
    expect(pertesVente({ batiments: 0, chantiers: 0 })).toBe('Aucun bâtiment à perdre.');
    expect(pertesVente({ batiments: 1, chantiers: 0 })).toBe('Ton bâtiment sera détruit.');
    expect(pertesVente({ batiments: 3, chantiers: 1 })).toBe(
      'Tes 3 bâtiments seront détruits, chantier en cours compris.',
    );
  });

  it('explique un refus de vente, sauf quand la commune n’est pas à moi', () => {
    expect(raisonVente('FORBIDDEN')).toBeNull();
    expect(raisonVente('UNAUTHENTICATED')).toBeNull();
    expect(raisonVente('CAPITAL_IMMUNE')).toBe('C’est ta capitale : elle ne se vend pas.');
    expect(raisonVente('TAKEOVER_ALREADY_PENDING')).toMatch(/OPA est en cours/);
  });

  it('reconnaît ma commune, bouclier ou OPA compris', () => {
    expect(estAMoi(fiche)).toBe(false);
    expect(estAMoi({ owner: { pseudo: 'Alice', markerColor: '#000000', avatarUrl: null, isMe: true } })).toBe(true);
    expect(estAMoi({ owner: { pseudo: 'Bob', markerColor: '#000000', avatarUrl: null, isMe: false } })).toBe(false);
  });
});

describe('durées et liste « Mes territoires »', () => {
  it('écrit une durée simplement', () => {
    expect(duree(10)).toBe('10 s');
    expect(duree(600)).toBe('10 min');
    expect(duree(9_600)).toBe('2 h 40');
    expect(duree(12 * 3_600)).toBe('12 h');
    expect(duree(100 * 3_600)).toBe('4 j 4 h');
    expect(duree(7 * 24 * 3_600)).toBe('7 j');
    expect(duree(-5)).toBe('0 s');
  });

  it('résume une commune : valeur, emplacements, chantier en cours, bouclier', () => {
    const maintenant = 1_000_000;
    const t: MonTerritoire = {
      insee: '01001',
      name: 'L’Abergement-Clémenciat',
      zone: 'MET',
      baseValue: 21_800,
      totalValue: 26_230,
      incomePerHour: 513,
      isCapital: false,
      shieldUntil: maintenant + 3_600,
      buildingSlots: { total: 3, used: 2 },
      works: [
        {
          buildingId: 2,
          territoryInsee: '01001',
          territoryName: 'L’Abergement-Clémenciat',
          typeCode: 'residence',
          name: 'Résidence',
          targetLevel: 2,
          startedAt: maintenant - 600,
          endsAt: maintenant + 600,
          cost: 8_860,
        },
      ],
    };

    expect(detailsTerritoire(t, maintenant).replace(espace, ' ')).toBe(
      'Valeur 26 230 ₮ · 2/3 emplacements · Résidence niv. 2 dans 10 min · bouclier 1 h',
    );
    expect(detailsTerritoire({ ...t, works: [], shieldUntil: maintenant - 1 }, maintenant).replace(espace, ' ')).toBe(
      'Valeur 26 230 ₮ · 2/3 emplacements',
    );
  });
});
