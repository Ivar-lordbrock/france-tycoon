import { SAUVEGARDES_GARDEES } from '@france-tycoon/shared';
import { useSauvegarder, useSauvegardes } from '../api/admin.ts';
import { messageErreur } from '../api/client.ts';
import { quand, Table } from './Joueurs.tsx';
import { Section, taille } from './VueEnsemble.tsx';

/** Copies de la base sur le serveur. Le bouton est pour les admins ; restaurer ou télécharger se fait par SSH. */
export function Sauvegardes({ admin }: { admin: boolean }) {
  const { data, error, isPending } = useSauvegardes();
  const sauver = useSauvegarder();

  return (
    <Section titre="Sauvegardes">
      <div className="flex flex-col gap-3">
        {admin && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => sauver.mutate()}
              disabled={sauver.isPending || data?.directory === null}
              className="relief h-10 px-4"
            >
              {sauver.isPending ? 'Copie en cours…' : 'Sauvegarder maintenant'}
            </button>
            {sauver.isSuccess && (
              <p role="status" className="text-sm text-succes">
                Copie faite ({taille(sauver.data.backup.bytes)})
                {sauver.data.deleted > 0 && `, la plus ancienne effacée`}.
              </p>
            )}
            {sauver.isError && (
              <p role="alert" className="text-sm text-danger">
                {messageErreur(sauver.error)}
              </p>
            )}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-danger">
            {messageErreur(error)}
          </p>
        ) : (
          <Table
            colonnes={[['Fichier'], ['Date'], ['Taille', true]]}
            lignes={(data?.backups ?? []).map((b) => [
              b.name,
              [
                <span key="n" className="font-mono text-xs">
                  {b.name}
                </span>,
                <span key="d" className="whitespace-nowrap tabular-nums">
                  {quand(b.createdAt)}
                </span>,
                <span key="t" className="tabular-nums">
                  {taille(b.bytes)}
                </span>,
              ],
            ])}
            vide={isPending ? 'Chargement…' : 'Aucune copie pour l’instant.'}
          />
        )}
        <p className="max-w-3xl text-sm text-ardoise">
          On garde les {SAUVEGARDES_GARDEES} dernières, sur le serveur
          {data?.directory && (
            <>
              {' '}
              (<span className="font-mono text-xs">{data.directory}</span>)
            </>
          )}
          . La copie chiffrée de chaque heure sur Google Drive continue à part. Restaurer ou télécharger une copie se
          fait seulement par SSH, jamais depuis le web.
        </p>
      </div>
    </Section>
  );
}
