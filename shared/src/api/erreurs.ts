import { z } from 'zod';

// Format commun de toutes les erreurs de l'API (docs/04-api.md, 4.1).

export const CODES_ERREUR = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ACCOUNT_SUSPENDED',
  'MAINTENANCE',
  'NOT_FOUND',
  'TERRITORY_NOT_FOUND',
  'TERRITORY_NOT_FREE',
  'TERRITORY_LIMIT_REACHED',
  'INSUFFICIENT_FUNDS',
  'NO_FREE_SLOT',
  'BUILD_QUEUE_FULL',
  'BUILDING_REQUIREMENT',
  'SHIELD_ACTIVE',
  'CAPITAL_IMMUNE',
  'NEWBIE_PROTECTION',
  'TAKEOVER_ALREADY_PENDING',
  'TAKEOVER_LIMIT',
  'TAKEOVER_COOLDOWN',
  'TAKEOVER_NOT_PENDING',
  'TARGET_TOO_SMALL',
  'WORKS_IN_PROGRESS',
  'NO_WORKS_IN_PROGRESS',
  'CAPITAL_COOLDOWN',
  'PSEUDO_TAKEN',
  'QUEST_NOT_CLAIMABLE',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'FEATURE_DISABLED',
  'INTERNAL_ERROR',
] as const;

export type CodeErreur = (typeof CODES_ERREUR)[number];

export const erreurApiSchema = z.object({
  error: z.object({
    code: z.enum(CODES_ERREUR),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErreurApi = z.infer<typeof erreurApiSchema>;
