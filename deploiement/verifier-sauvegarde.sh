#!/usr/bin/env bash
# Vérifie que la sauvegarde marche vraiment : récupère la dernière copie (Backblaze B2) dans un
# dossier temporaire, contrôle qu'elle n'est pas abîmée et la compare à la base du jeu.
# Ne touche pas à la base du jeu.
#
#   sudo bash /srv/france-tycoon/app/deploiement/verifier-sauvegarde.sh
set -euo pipefail

main() {
  local base=/var/lib/france-tycoon/france-tycoon.sqlite essai copie table ici la ecart=0
  cd /
  if [[ $EUID -ne 0 ]]; then
    echo "À lancer avec sudo : sudo bash $0" >&2
    exit 1
  fi
  if ! systemctl is-active --quiet france-tycoon-sauvegarde.service; then
    echo "La sauvegarde ne tourne pas. Pour voir pourquoi : sudo journalctl -u france-tycoon-sauvegarde -n 50" >&2
    exit 1
  fi

  # tmp n'est pas « local » : le nettoyage (trap) tourne après la fin de main.
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  copie="$tmp/copie.sqlite"

  # Juste après l'installation, la première copie peut mettre quelques secondes à partir.
  for essai in $(seq 1 12); do
    rm -f "$copie"*
    if litestream restore -config /etc/litestream.yml -o "$copie" "$base" >"$tmp/journal" 2>&1; then
      break
    fi
    if [[ $essai -eq 12 ]]; then
      cat "$tmp/journal" >&2
      echo "Impossible de récupérer la sauvegarde." >&2
      exit 1
    fi
    sleep 5
  done
  echo "Copie récupérée : $(du -h "$copie" | cut -f1)."

  if [[ $(sqlite3 -readonly "$copie" 'PRAGMA integrity_check') != ok ]]; then
    echo "La copie est abîmée (PRAGMA integrity_check)." >&2
    exit 1
  fi
  echo "Copie en bon état."

  # La copie peut avoir quelques secondes de retard : on compare des tables qui bougent peu.
  for table in schema_migrations territories users; do
    ici=$(sqlite3 -readonly "$base" "SELECT count(*) FROM $table")
    la=$(sqlite3 -readonly "$copie" "SELECT count(*) FROM $table")
    printf '  %-18s jeu : %-8s copie : %s\n' "$table" "$ici" "$la"
    [[ $ici == "$la" ]] || ecart=1
  done
  if [[ $ecart -ne 0 ]]; then
    echo "Écart entre le jeu et la copie : normal juste après un import ou une inscription, relancer dans une minute." >&2
    exit 1
  fi
  echo "La sauvegarde est bonne."
}

main "$@"
