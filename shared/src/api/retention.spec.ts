import { describe, expect, it } from 'vitest';
import { REGIONS } from '../zones.ts';
import { classementQuerySchema, porteeClassementSchema, profilPublicSchema } from './classement.ts';
import { EVENEMENTS_QUETE, type Quete, queteSchema, quetesReponseSchema, suiviCorpsSchema } from './quetes.ts';
import { etapeTutorielParamsSchema, tutorielReponseSchema } from './tutoriel.ts';

const quete: Quete = {
  id: 12,
  slot: 1,
  code: 'reperage',
  title: 'Repérage',
  description: 'Consulte 5 fiches de communes.',
  difficulty: 'facile',
  eventType: 'territory_visited',
  target: 5,
  progress: 2,
  rewardCash: 1_700,
  rewardGems: 0,
  completedAt: null,
  claimedAt: null,
};

describe('contrat des quêtes, du tutoriel et du classement (étape 5)', () => {
  it('les événements sont ceux de la table daily_quests', () => {
    expect(EVENEMENTS_QUETE).toEqual([
      'login',
      'income_collected',
      'territory_visited',
      'zone_visited',
      'territory_bought',
      'building_started',
      'building_upgraded',
      'takeover_launched',
      'takeover_defended',
      'leaderboard_viewed',
    ]);
  });

  it('les quêtes du jour : 3 au plus, avec le jour de Paris', () => {
    const reponse = { date: '2026-11-17', resetsAt: 1_795_474_800, quests: [quete] };
    expect(quetesReponseSchema.parse(reponse)).toEqual(reponse);
    expect(quetesReponseSchema.safeParse({ ...reponse, date: '17/11/2026' }).success).toBe(false);
    expect(quetesReponseSchema.safeParse({ ...reponse, quests: [quete, quete, quete, quete] }).success).toBe(false);
    expect(queteSchema.safeParse({ ...quete, slot: 4 }).success).toBe(false);
  });

  it('suivi : seulement ce que l’écran voit', () => {
    expect(suiviCorpsSchema.parse({ type: 'zone_visited', ref: 'GP' })).toEqual({ type: 'zone_visited', ref: 'GP' });
    expect(suiviCorpsSchema.safeParse({ type: 'territory_bought', ref: '01001' }).success).toBe(false);
    expect(suiviCorpsSchema.safeParse({ type: 'territory_visited', ref: '' }).success).toBe(false);
  });

  it('tutoriel : étapes dans l’ordre, clé d’étape sans caractère bizarre', () => {
    const tutoriel = {
      steps: [
        {
          key: 'premier_achat',
          position: 5,
          title: 'Ton premier territoire',
          body: 'Achète une commune libre.',
          anchor: 'buy-button',
          validatedBy: 'server',
          rewardCash: 5_000,
          rewardGems: 0,
          completedAt: null,
        },
      ],
      completedAt: null,
      skipped: false,
    };
    expect(tutorielReponseSchema.parse(tutoriel)).toEqual(tutoriel);
    expect(etapeTutorielParamsSchema.safeParse({ stepKey: 'premier_achat' }).success).toBe(true);
    expect(etapeTutorielParamsSchema.safeParse({ stepKey: '../admin' }).success).toBe(false);
  });

  it('classement : national par défaut, régions à 2 ou 3 chiffres', () => {
    expect(classementQuerySchema.parse({})).toEqual({ scope: 'national' });
    expect(classementQuerySchema.parse({ scope: 'region:84', cursor: '50' })).toEqual({
      scope: 'region:84',
      cursor: 50,
    });
    for (const portee of ['metropole', 'outre_mer', 'region:987']) {
      expect(porteeClassementSchema.safeParse(portee).success).toBe(true);
    }
    for (const portee of ['europe', 'region:8', 'region:abc']) {
      expect(porteeClassementSchema.safeParse(portee).success).toBe(false);
    }
  });

  it('toutes les régions ont un code de classement valide, sans doublon', () => {
    const codes = REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(24);
    for (const code of codes) expect(porteeClassementSchema.safeParse(`region:${code}`).success).toBe(true);
  });

  it('profil public : rien de privé ne passe', () => {
    const profil = profilPublicSchema.parse({
      pseudo: 'Bruno',
      avatar: null,
      markerColor: '#2563eb',
      rankLevel: 1,
      netWorth: 300_000,
      nationalRank: 3,
      createdAt: 1_790_000_000,
      territories: [{ insee: '01053', name: 'Bourg-en-Bresse', zone: 'MET', isCapital: true }],
      cash: 12_000,
      email: 'bruno@example.com',
    });
    expect(profil).not.toHaveProperty('cash');
    expect(profil).not.toHaveProperty('email');
  });
});
