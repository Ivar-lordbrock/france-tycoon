import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { lireZip } from './zip.ts';

/** Fabrique un zip minimal (CRC à 0 : le lecteur ne le vérifie pas). */
function fabriquerZip(fichiers: { nom: string; contenu: string; compresser: boolean }[]): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let position = 0;
  for (const { nom, contenu, compresser } of fichiers) {
    const brut = Buffer.from(contenu);
    const donnees = compresser ? deflateRawSync(brut) : brut;
    const nomOctets = Buffer.from(nom);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(compresser ? 8 : 0, 8);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(compresser ? 8 : 0, 10);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt32LE(position, 42);
    locaux.push(local, nomOctets, donnees);
    centraux.push(central, nomOctets);
    position += 30 + nomOctets.length + donnees.length;
  }
  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(position, 16);
  return Buffer.concat([...locaux, repertoire, fin]);
}

describe('lireZip', () => {
  it('liste les fichiers et lit un fichier compressé ou stocké', () => {
    const csv = 'GEO;OBS_VALUE\n010010000;3\n'.repeat(50);
    const zip = fabriquerZip([
      { nom: 'ds_bpe.csv', contenu: csv, compresser: true },
      { nom: 'lisez-moi.txt', contenu: 'bonjour', compresser: false },
    ]);

    const fichiers = lireZip(zip);

    expect(fichiers.map((f) => [f.nom, f.taille])).toEqual([
      ['ds_bpe.csv', csv.length],
      ['lisez-moi.txt', 7],
    ]);
    expect(fichiers[0]?.lire().toString()).toBe(csv);
    expect(fichiers[1]?.lire().toString()).toBe('bonjour');
  });

  it('refuse un fichier qui n’est pas un zip', () => {
    expect(() => lireZip(Buffer.from('pas un zip, juste du texte assez long pour être lu'))).toThrow(/Zip illisible/);
  });
});
