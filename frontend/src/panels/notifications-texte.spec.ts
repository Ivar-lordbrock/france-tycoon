import type { ContenuOpaTerminee, NotificationJeu } from '@france-tycoon/shared';
import { describe, expect, it } from 'vitest';
import {
  communeDe,
  ilYa,
  issueOpa,
  phraseNotification,
  phraseNouveauRang,
  recompenseQuete,
  toastDirect,
} from './notifications-texte.ts';

const maintenant = 1_800_000_000;
const espaces = (texte: string | undefined) => texte?.replace(/\s/g, ' ');
const message = { id: 9, createdAt: maintenant - 120, readAt: null };

const issue = (status: ContenuOpaTerminee['status'], role: ContenuOpaTerminee['role']): ContenuOpaTerminee => ({
  takeoverId: 7,
  territoryInsee: '01001',
  territoryName: 'L’Abergement-Clémenciat',
  status,
  role,
  otherPseudo: role === 'attacker' ? 'Bruno' : 'Alice',
});

describe('centre de notifications', () => {
  it('il y a combien de temps', () => {
    expect(ilYa(maintenant - 20, maintenant)).toBe('à l’instant');
    expect(ilYa(maintenant - 12 * 60 - 30, maintenant)).toBe('il y a 12 min');
    expect(ilYa(maintenant - 3 * 3_600, maintenant)).toBe('il y a 3 h');
    expect(ilYa(maintenant - 2 * 86_400 - 5, maintenant)).toBe('il y a 2 j');
  });

  it('chaque issue d’OPA, selon mon rôle', () => {
    expect(issueOpa(issue('defended', 'attacker'))).toEqual({
      texte: 'Bruno a défendu L’Abergement-Clémenciat : ton offre t’est rendue, moins l’indemnité.',
      parMoi: false,
    });
    expect(issueOpa(issue('defended', 'defender')).parMoi).toBe(true);
    expect(issueOpa(issue('accepted', 'attacker')).texte).toBe(
      'Bruno a accepté ton offre : L’Abergement-Clémenciat est à toi !',
    );
    expect(issueOpa(issue('accepted', 'defender'))).toMatchObject({ parMoi: true });
    expect(issueOpa(issue('succeeded', 'defender'))).toEqual({
      texte: 'L’Abergement-Clémenciat est passée à Alice : l’OPA est restée sans réponse.',
      parMoi: false,
    });
    expect(issueOpa(issue('cancelled', 'attacker'))).toMatchObject({ parMoi: true });
    expect(issueOpa(issue('cancelled', 'defender')).texte).toContain('tu gardes la commune et touches l’indemnité');
    expect(issueOpa(issue('voided', 'attacker')).texte).toBe(
      'Ton OPA sur L’Abergement-Clémenciat est annulée : ton offre t’est rendue en entier.',
    );
  });

  it('une phrase par type de message, et la commune où il amène', () => {
    const chantier: NotificationJeu = {
      ...message,
      kind: 'building_done',
      payload: {
        buildingId: 3,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        typeCode: 'residence',
        name: 'Résidence',
        level: 2,
        finishedAt: maintenant - 120,
      },
    };
    expect(phraseNotification(chantier)).toBe('Résidence à L’Abergement-Clémenciat : niveau 2 atteint.');
    expect(communeDe(chantier)).toEqual({ insee: '01001', onglet: 'batiments' });

    const recue: NotificationJeu = {
      ...message,
      kind: 'takeover_received',
      payload: {
        takeoverId: 7,
        territoryInsee: '01001',
        territoryName: 'L’Abergement-Clémenciat',
        attackerPseudo: 'Alice',
        offerAmount: 32_700,
        defenseCost: 7_700,
        expiresAt: maintenant + 86_000,
      },
    };
    expect(espaces(phraseNotification(recue))).toBe(
      'Alice lance une OPA sur L’Abergement-Clémenciat : 32 700 ₮ offerts.',
    );
    expect(communeDe(recue)).toEqual({ insee: '01001' });

    const liberee: NotificationJeu = {
      ...message,
      kind: 'inactivity_released',
      payload: { territories: 1, amount: 9_000 },
    };
    expect(espaces(phraseNotification(liberee))).toBe(
      'Après 14 jours d’absence, l’État a racheté ta commune pour 9 000 ₮. Ton cash est intact.',
    );
    expect(communeDe(liberee)).toBeNull();
    expect(
      phraseNotification({ ...message, kind: 'inactivity_warning', payload: { releaseAt: maintenant + 3 * 86_400 } }),
    ).toMatch(/^Longue absence : tes communes seront libérées le .+ si tu ne joues pas d’ici là\.$/);
  });
});

describe('petits messages en direct', () => {
  it('OPA reçue : à moi de réagir', () => {
    const toast = toastDirect({
      type: 'takeover.received',
      data: {
        ...message,
        kind: 'takeover_received',
        payload: {
          takeoverId: 7,
          territoryInsee: '01001',
          territoryName: 'L’Abergement-Clémenciat',
          attackerPseudo: 'Alice',
          offerAmount: 32_700,
          defenseCost: 7_700,
          expiresAt: maintenant + 86_000,
        },
      },
    });
    expect({ ...toast, texte: espaces(toast?.texte) }).toEqual({
      texte: 'OPA reçue sur L’Abergement-Clémenciat : Alice offre 32 700 ₮. Tu as 24 h pour réagir.',
      ton: 'alerte',
      commune: { insee: '01001' },
      libelle: 'Réagir',
    });
  });

  it('rien pour ce que j’ai fait moi-même, ni pour un chantier ou le solde', () => {
    const terminee = (status: ContenuOpaTerminee['status'], role: ContenuOpaTerminee['role']) =>
      toastDirect({
        type: 'takeover.resolved',
        data: { ...message, kind: 'takeover_resolved', payload: issue(status, role) },
      });
    expect(terminee('defended', 'defender')).toBeNull();
    expect(terminee('cancelled', 'attacker')).toBeNull();
    expect(terminee('defended', 'attacker')).toMatchObject({ ton: 'info', libelle: 'Voir' });
    expect(toastDirect({ type: 'wallet.changed', data: { cash: 1, gems: 0, incomePerHour: 0 } })).toBeNull();
  });

  it('quête réussie : la récompense à réclamer, sans commune', () => {
    const reussie: NotificationJeu = {
      ...message,
      kind: 'quest_completed',
      payload: { questId: 3, code: 'chantiers', title: 'Chef de chantier', rewardCash: 1_500, rewardGems: 0 },
    };
    expect(espaces(phraseNotification(reussie))).toBe('Quête « Chef de chantier » réussie : 1 500 ₮ à réclamer.');
    expect(communeDe(reussie)).toBeNull();
    const toast = toastDirect({ type: 'quest.completed', data: reussie });
    expect({ ...toast, texte: espaces(toast?.texte) }).toEqual({
      texte: 'Quête « Chef de chantier » réussie : 1 500 ₮ à réclamer.',
      ton: 'info',
    });
    expect(espaces(recompenseQuete({ rewardCash: 3_000, rewardGems: 2 }))).toBe('3 000 ₮ et 2 gemmes');
    expect(recompenseQuete({ rewardCash: 0, rewardGems: 1 })).toBe('1 gemme');
  });

  it('nouveau rang : son nom, et la limite seulement si elle a monté', () => {
    const baron: NotificationJeu = {
      ...message,
      kind: 'rank_up',
      payload: { rankLevel: 2, previousLevel: 1, maxTerritories: 6 },
    };
    expect(phraseNotification(baron)).toBe('Nouveau rang : Baron ! Tu peux posséder 6 communes.');
    expect(communeDe(baron)).toBeNull();
    expect(toastDirect({ type: 'rank.up', data: baron })).toEqual({
      texte: 'Nouveau rang : Baron ! Tu peux posséder 6 communes.',
      ton: 'info',
    });
    expect(phraseNouveauRang({ rankLevel: 1, previousLevel: 0, maxTerritories: 5 })).toBe('Nouveau rang : Notable !');
    expect(phraseNouveauRang({ rankLevel: 4, previousLevel: 3, maxTerritories: 7 })).toBe('Nouveau rang : Tycoon !');
    // Deux rangs d'un coup (Entrepreneur → Baron) : la limite a monté.
    expect(phraseNouveauRang({ rankLevel: 2, previousLevel: 0, maxTerritories: 5 })).toBe(
      'Nouveau rang : Baron ! Tu peux posséder 5 communes.',
    );
  });
});
