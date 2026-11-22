#!/usr/bin/env bash
# Remet la base du jeu à partir de la sauvegarde (Backblaze B2), en cas de gros problème.
# Le jeu est arrêté pendant l'opération. L'ancienne base n'est pas effacée : elle est rangée
# dans /var/lib/france-tycoon/avant-restauration-<date>.
#
#   sudo bash /srv/france-tycoon/app/deploiement/restaurer-sauvegarde.sh
#   sudo bash .../restaurer-sauvegarde.sh -timestamp 2026-12-01T18:00:00Z   (état à une heure précise, heure UTC)
set -euo pipefail

main() {
  local donnees=/var/lib/france-tycoon base=/var/lib/france-tycoon/france-tycoon.sqlite rangement fichier essai
  local -a options=()
  cd /
  if [[ $EUID -ne 0 ]]; then
    echo "À lancer avec sudo : sudo bash $0" >&2
    exit 1
  fi
  if [[ ${1:-} == -timestamp ]]; then
    [[ -n ${2:-} ]] || { echo "Il manque l'heure après -timestamp (ex. 2026-12-01T18:00:00Z)." >&2; exit 1; }
    options=(-timestamp "$2")
  fi
  if [[ ! -f /etc/litestream.yml ]]; then
    echo "Pas de sauvegarde réglée (/etc/litestream.yml absent)." >&2
    exit 1
  fi

  echo "Le jeu va être arrêté et sa base remplacée par la sauvegarde${2:+ du $2}."
  if [[ ${CONFIRMER:-} != OUI ]]; then
    read -r -p "Taper OUI pour continuer : " CONFIRMER
  fi
  [[ $CONFIRMER == OUI ]] || { echo "Annulé."; exit 1; }

  echo "== Arrêt du jeu et de la sauvegarde"
  systemctl stop france-tycoon-sauvegarde.service france-tycoon.service

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

  echo "== Récupération de la sauvegarde"
  if ! sudo -u france-tycoon litestream restore -config /etc/litestream.yml "${options[@]}" "$base"; then
    echo "Échec. Pour remettre l'ancienne base : sudo mv $rangement/* $donnees/ puis sudo systemctl start france-tycoon" >&2
    exit 1
  fi
  if [[ $(sqlite3 -readonly "$base" 'PRAGMA integrity_check') != ok ]]; then
    echo "La sauvegarde récupérée est abîmée. L'ancienne base est dans $rangement" >&2
    exit 1
  fi

  echo "== Redémarrage"
  systemctl start france-tycoon.service
  for essai in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/api/v1/admin/health; then
      systemctl start france-tycoon-sauvegarde.service
      echo "C'est fait : le jeu repart de la sauvegarde (après $essai s)."
      return 0
    fi
    sleep 1
  done
  echo "Le jeu ne répond pas. Pour voir pourquoi : sudo journalctl -u france-tycoon -n 50" >&2
  exit 1
}

main "$@"
