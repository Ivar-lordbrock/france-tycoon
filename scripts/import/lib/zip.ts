import { inflateRawSync } from 'node:zlib';

export interface FichierZip {
  nom: string;
  taille: number;
  /** Contenu décompressé. */
  lire: () => Buffer;
}

const SIGNATURE_FIN = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

/**
 * Lecteur de zip minimal (fichiers « stockés » ou « deflate », sans zip64) : assez pour les
 * archives de l'INSEE, sans ajouter de dépendance.
 */
export function lireZip(archive: Buffer): FichierZip[] {
  // Fin du répertoire central : dans les 64 Ko de la fin (22 octets + commentaire éventuel).
  let fin = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65_557); i--) {
    if (archive.readUInt32LE(i) === SIGNATURE_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('Zip illisible : fin du répertoire central introuvable');

  const nombre = archive.readUInt16LE(fin + 10);
  let position = archive.readUInt32LE(fin + 16);
  const fichiers: FichierZip[] = [];

  for (let n = 0; n < nombre; n++) {
    if (archive.readUInt32LE(position) !== SIGNATURE_CENTRAL) throw new Error('Zip illisible : répertoire central');
    const methode = archive.readUInt16LE(position + 10);
    const tailleCompressee = archive.readUInt32LE(position + 20);
    const taille = archive.readUInt32LE(position + 24);
    const longueurNom = archive.readUInt16LE(position + 28);
    const longueurExtra = archive.readUInt16LE(position + 30);
    const longueurCommentaire = archive.readUInt16LE(position + 32);
    const local = archive.readUInt32LE(position + 42);
    const nom = archive.toString('utf8', position + 46, position + 46 + longueurNom);
    if (tailleCompressee === 0xffffffff || local === 0xffffffff) throw new Error(`Zip64 non géré (${nom})`);

    fichiers.push({
      nom,
      taille,
      lire: () => {
        if (archive.readUInt32LE(local) !== SIGNATURE_LOCAL) throw new Error(`Zip illisible : en-tête de ${nom}`);
        const debut = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
        const donnees = archive.subarray(debut, debut + tailleCompressee);
        if (methode === 0) return Buffer.from(donnees);
        if (methode === 8) return inflateRawSync(donnees);
        throw new Error(`Méthode de compression ${methode} non gérée (${nom})`);
      },
    });
    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return fichiers;
}
