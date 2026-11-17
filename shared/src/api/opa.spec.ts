import { describe, expect, it } from 'vitest';
import { montantsOpa } from '../balance.ts';
import { evenementDirectSchema, notificationSchema, notificationsQuerySchema } from './notifications.ts';
import { devisOpaSchema, mesOpaQuerySchema, type Opa, opaParamsSchema, opaSchema, STATUTS_OPA } from './opa.ts';

const { offre, defense, indemnite } = montantsOpa(30_000);

const opa: Opa = {
  id: 7,
  territory: { insee: '01001', name: 'L’Abergement-Clémenciat', zone: 'MET' },
  attacker: { pseudo: 'Rapace', markerColor: '#dc2626' },
  defender: { pseudo: 'Revue2', markerColor: '#2563eb' },
  role: 'defender',
  territoryValue: 30_000,
  offerAmount: offre,
  defenseCost: defense,
  breakFee: indemnite,
  status: 'pending',
  createdAt: 1_000,
  expiresAt: 1_000 + 86_400,
  resolvedAt: null,
};

describe('contrat des routes OPA (étape 4)', () => {
  it('un devis porte les montants de balance.ts et les raisons d’un refus', () => {
    const devis = devisOpaSchema.parse({
      territoryValue: 30_000,
      offerAmount: offre,
      defenseCost: defense,
      breakFee: indemnite,
      eligible: false,
      reasons: ['NEWBIE_PROTECTION', 'TARGET_TOO_SMALL'],
    });
    expect(devis.offerAmount).toBe(45_000);
    expect(devisOpaSchema.safeParse({ ...devis, reasons: ['PAS_UN_CODE'] }).success).toBe(false);
  });

  it('les statuts sont ceux de la table takeovers', () => {
    expect(STATUTS_OPA).toEqual(['pending', 'defended', 'accepted', 'succeeded', 'cancelled', 'voided']);
    expect(opaSchema.parse(opa)).toEqual(opa);
    expect(opaSchema.safeParse({ ...opa, status: 'won' }).success).toBe(false);
  });

  it('lit les filtres de « mes OPA » et l’identifiant d’une OPA', () => {
    expect(mesOpaQuerySchema.parse({ role: 'attacker', status: 'pending' })).toEqual({
      role: 'attacker',
      status: 'pending',
    });
    expect(mesOpaQuerySchema.parse({})).toEqual({});
    expect(mesOpaQuerySchema.safeParse({ role: 'spectateur' }).success).toBe(false);
    expect(opaParamsSchema.parse({ id: '7' })).toEqual({ id: 7 });
    expect(opaParamsSchema.safeParse({ id: '-1' }).success).toBe(false);
  });
});

describe('contrat des messages et du direct (étape 4)', () => {
  const chantierFini = {
    id: 3,
    createdAt: 2_000,
    readAt: null,
    kind: 'building_done',
    payload: {
      buildingId: 1,
      territoryInsee: '01001',
      territoryName: 'L’Abergement-Clémenciat',
      typeCode: 'residence',
      name: 'Résidence',
      level: 1,
      finishedAt: 2_000,
    },
  };

  it('le contenu d’un message dépend de son type', () => {
    expect(notificationSchema.parse(chantierFini).kind).toBe('building_done');
    const opaRecue = {
      id: 4,
      createdAt: 1_000,
      readAt: null,
      kind: 'takeover_received',
      payload: {
        takeoverId: 7,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        attackerPseudo: 'Rapace',
        offerAmount: offre,
        defenseCost: defense,
        expiresAt: opa.expiresAt,
      },
    };
    expect(notificationSchema.parse(opaRecue).kind).toBe('takeover_received');
    // Un contenu de chantier fini ne passe pas pour une OPA reçue.
    expect(notificationSchema.safeParse({ ...chantierFini, kind: 'takeover_received' }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...chantierFini, kind: 'inconnu' }).success).toBe(false);
  });

  it('une OPA terminée ne peut pas être « en cours »', () => {
    const terminee = {
      id: 5,
      createdAt: 3_000,
      readAt: 3_100,
      kind: 'takeover_resolved',
      payload: {
        takeoverId: 7,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        status: 'defended',
        role: 'attacker',
        otherPseudo: 'Revue2',
      },
    };
    expect(notificationSchema.safeParse(terminee).success).toBe(true);
    expect(
      notificationSchema.safeParse({ ...terminee, payload: { ...terminee.payload, status: 'pending' } }).success,
    ).toBe(false);
  });

  it('pages de messages : 20 par défaut, 50 au plus', () => {
    expect(notificationsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(notificationsQuerySchema.parse({ before: '12', limit: '5' })).toEqual({ before: 12, limit: 5 });
    expect(notificationsQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('un message en direct porte le même contenu que le centre de notifications', () => {
    const evenement = evenementDirectSchema.parse({ type: 'building.done', data: chantierFini });
    expect(evenement.type).toBe('building.done');
    expect(evenementDirectSchema.safeParse({ type: 'takeover.received', data: chantierFini }).success).toBe(false);
    expect(
      evenementDirectSchema.parse({ type: 'wallet.changed', data: { cash: 12_000, gems: 0, incomePerHour: 513 } }).type,
    ).toBe('wallet.changed');
  });
});
