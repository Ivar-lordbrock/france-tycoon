import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fermerBase, ouvrirBase } from './connexion.ts';

const dossier = mkdtempSync(join(tmpdir(), 'ft-connexion-'));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe('connexion SQLite', () => {
  it('applique les réglages de 001_initial.sql sur un fichier', () => {
    const db = ouvrirBase(join(dossier, 'sous-dossier', 'jeu.sqlite'));
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
      expect(db.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
    } finally {
      fermerBase(db);
    }
    expect(db.open).toBe(false);
  });

  it('active les clés étrangères en mémoire aussi', () => {
    const db = ouvrirBase(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    fermerBase(db);
    fermerBase(db); // deuxième fermeture sans erreur
  });
});
