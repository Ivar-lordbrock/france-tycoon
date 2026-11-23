#!/usr/bin/env bash
# Sauvegarde de la base sur Google Drive (choisie le 23/11/2026 à la place de Backblaze).
# Chaque heure, une copie de la base est compressée puis chiffrée par rclone avant de partir :
# Google ne peut pas la lire. Le mot de passe est dans /etc/france-tycoon/rclone.conf (root seul)
# et chez le responsable du jeu (sans lui, une copie ne sert à rien si le serveur est perdu).
# Noms fixes, chaque copie remplace celle du même nom : heure-00 à heure-23, et jour-1 (lundi)
# à jour-7 pour la copie de 3 h. Donc 7 jours d'historique, comme promis dans les pages légales,
# sans rien à effacer.
#
# Installé par installer-serveur.sh dans /usr/local/sbin (à root : le jeu ne peut pas le modifier).
#   sudo kadastr-sauvegarde-drive                      envoie une copie (fait chaque heure par le .timer)
#   sudo kadastr-sauvegarde-drive verifier             récupère la dernière copie et la contrôle
#   sudo kadastr-sauvegarde-drive restaurer heure-14   remet le jeu sur cette copie
#   sudo kadastr-sauvegarde-drive liste                montre les copies et leur date
set -euo pipefail

readonly BASE=/var/lib/france-tycoon/france-tycoon.sqlite
readonly DISTANT=kadastr-drive:

rc() { rclone --config /etc/france-tycoon/rclone.conf "$@"; }

envoyer() {
  local heure
  heure=$(date +%H)
  # .backup : copie cohérente même si le jeu écrit en même temps. -readonly : ne crée jamais de base vide.
  sqlite3 -readonly "$BASE" ".backup $tmp/copie.sqlite"
  gzip "$tmp/copie.sqlite"
  rc copyto "$tmp/copie.sqlite.gz" "${DISTANT}heure-$heure.sqlite.gz"
  # 3 h plutôt que 4 h : le serveur peut redémarrer seul vers 4 h (mises à jour de sécurité).
  if [[ $heure == 03 ]]; then
    rc copyto "$tmp/copie.sqlite.gz" "${DISTANT}jour-$(date +%u).sqlite.gz"
  fi
}

# Récupère une copie dans $tmp/copie.sqlite et vérifie qu'elle n'est pas abîmée.
recuperer() {
  rc cat "$DISTANT$1.sqlite.gz" | gunzip >"$tmp/copie.sqlite"
  if [[ $(sqlite3 -readonly "$tmp/copie.sqlite" 'PRAGMA integrity_check') != ok ]]; then
    echo "La copie $1 est abîmée (PRAGMA integrity_check)." >&2
    exit 1
  fi
  echo "Copie $1 récupérée et en bon état ($(du -h "$tmp/copie.sqlite" | cut -f1))."
}

verifier() {
  local nom table
  # Format « date;nom » : le tri met la plus récente en tête.
  nom=$(rc lsf --format tp --files-only "$DISTANT" | sort -r | head -1 | cut -d';' -f2)
  [[ -n $nom ]] || { echo "Aucune copie sur Google Drive." >&2; exit 1; }
  recuperer "${nom%.sqlite.gz}"
  # La copie a jusqu'à une heure de retard : un petit écart est normal.
  for table in schema_migrations territories users; do
    printf '  %-18s jeu : %-8s copie : %s\n' "$table" \
      "$(sqlite3 -readonly "$BASE" "SELECT count(*) FROM $table")" \
      "$(sqlite3 -readonly "$tmp/copie.sqlite" "SELECT count(*) FROM $table")"
  done
  echo "La sauvegarde est bonne."
}

restaurer() {
  local nom=${1:-} donnees rangement fichier essai
  donnees=$(dirname "$BASE")
  [[ $nom =~ ^(heure-[0-2][0-9]|jour-[1-7])$ ]] || {
    echo "Dire quelle copie : heure-00 à heure-23 ou jour-1 à jour-7 (voir : kadastr-sauvegarde-drive liste)." >&2
    exit 1
  }
  # Téléchargée et contrôlée avant de toucher au jeu : il tourne encore pendant ce temps.
  recuperer "$nom"

  echo "Le jeu va être arrêté et sa base remplacée par la copie $nom."
  if [[ ${CONFIRMER:-} != OUI ]]; then
    read -r -p "Taper OUI pour continuer : " CONFIRMER
  fi
  [[ $CONFIRMER == OUI ]] || { echo "Annulé."; exit 1; }

  echo "== Arrêt du jeu et des sauvegardes"
  systemctl stop france-tycoon-sauvegarde-drive.timer france-tycoon-sauvegarde.service france-tycoon.service

  echo "== Rangement de l'ancienne base"
  rangement="$donnees/avant-restauration-$(date +%Y%m%d-%H%M%S)"
  install -d -o france-tycoon -g france-tycoon -m 750 "$rangement"
  shopt -s dotglob nullglob
  for fichier in "$donnees"/*; do
    [[ $fichier == "$donnees"/avant-restauration-* ]] && continue
    mv "$fichier" "$rangement/"
  done
  shopt -u dotglob nullglob
  echo "Rangée dans $rangement"
  install -o france-tycoon -g france-tycoon -m 644 "$tmp/copie.sqlite" "$BASE"

  echo "== Redémarrage"
  systemctl start france-tycoon.service
  for essai in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/api/v1/admin/health; then
      systemctl start france-tycoon-sauvegarde-drive.timer
      # Litestream (Backblaze), s'il est réglé, repart sur la base remise.
      if systemctl is-enabled --quiet france-tycoon-sauvegarde.service; then
        systemctl start france-tycoon-sauvegarde.service
      fi
      echo "C'est fait : le jeu repart de la copie $nom (après $essai s)."
      return 0
    fi
    sleep 1
  done
  echo "Le jeu ne répond pas. Pour voir pourquoi : sudo journalctl -u france-tycoon -n 50" >&2
  echo "Pour remettre l'ancienne base : sudo systemctl stop france-tycoon ; sudo mv $rangement/* $donnees/" >&2
  exit 1
}

main() {
  cd /
  if [[ $EUID -ne 0 ]]; then
    echo "À lancer avec sudo : sudo $0" >&2
    exit 1
  fi
  # tmp n'est pas « local » : le nettoyage (trap) tourne après la fin de main.
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  case ${1:-envoyer} in
    envoyer) envoyer ;;
    verifier) verifier ;;
    restaurer) restaurer "${2:-}" ;;
    liste) rc lsl "$DISTANT" | sort -k4 ;;
    *) echo "Actions : envoyer, verifier, restaurer <copie>, liste." >&2; exit 1 ;;
  esac
}

main "$@"
