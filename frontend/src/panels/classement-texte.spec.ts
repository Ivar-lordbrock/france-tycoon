import { describe, expect, it } from 'vitest';
import { nomRang, place } from './classement-texte.ts';

describe('textes du classement', () => {
  it('nom du rang, même pour un niveau inconnu', () => {
    expect(nomRang(0)).toBe('Entrepreneur');
    expect(nomRang(2)).toBe('Baron');
    expect(nomRang(9)).toBe('niveau 9');
  });

  it('place : « 1er » puis « 2e »', () => {
    expect(place(1)).toBe('1er');
    expect(place(2)).toBe('2e');
    expect(place(147)).toBe('147e');
  });
});
