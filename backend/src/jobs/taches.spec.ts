import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { baseDeTest } from '../outils-test/base.ts';
import { demarrerTaches } from './taches.ts';

const journal = () => ({ error: vi.fn() });

describe('demarrerTaches', () => {
  it('lance chaque tâche tout de suite et note le résultat dans job_runs', () => {
    const db = baseDeTest();
    const executer = vi.fn(() => ({ fait: 3 }));

    const arreter = demarrerTaches(db, journal() as unknown as FastifyBaseLogger, [
      { nom: 'essai', toutesLes: 3_600, executer },
    ]);
    arreter();

    expect(executer).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT job_name AS nom, status, details FROM job_runs').all()).toEqual([
      { nom: 'essai', status: 'ok', details: '{"fait":3}' },
    ]);
  });

  it('une tâche en échec est notée « error » et journalisée, sans arrêter le serveur', () => {
    const db = baseDeTest();
    const log = journal();

    const arreter = demarrerTaches(db, log as unknown as FastifyBaseLogger, [
      {
        nom: 'essai',
        toutesLes: 3_600,
        executer: () => {
          throw new Error('panne');
        },
      },
    ]);
    arreter();

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT status, details FROM job_runs').get()).toEqual({
      status: 'error',
      details: '{"message":"panne"}',
    });
  });
});
