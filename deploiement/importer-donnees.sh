#!/usr/bin/env bash
# Remplit la base du jeu avec les communes, les équipements (INSEE) et les lieux (OpenStreetMap).
# Environ 40 minutes. L'import tourne en arrière-plan sur le serveur : fermer la fenêtre SSH ne l'arrête pas.
# Le relancer plus tard ne crée pas de doublon (voir scripts/import/README.md).
#
#   sudo bash /srv/france-tycoon/app/deploiement/importer-donnees.sh
set -euo pipefail

main() {
  cd /
  if [[ $EUID -ne 0 ]]; then
    echo "À lancer avec sudo : sudo bash $0" >&2
    exit 1
  fi
  if systemctl is-active --quiet france-tycoon-import.service; then
    echo "Un import tourne déjà. Le suivre : sudo journalctl -fu france-tycoon-import"
    exit 0
  fi
  systemctl reset-failed france-tycoon-import.service 2>/dev/null || true

  systemd-run --unit france-tycoon-import --description "Kadastr : import des données" \
    --uid france-tycoon --gid france-tycoon \
    --working-directory /srv/france-tycoon/app \
    --setenv=HOME=/srv/france-tycoon --setenv=PATH=/usr/bin:/bin --setenv=TZ=Europe/Paris \
    bash -c 'npm run import:communes && npm run import:bpe && npm run import:osm'

  echo
  echo "Import lancé en arrière-plan (environ 40 minutes)."
  echo "Le suivre en direct : sudo journalctl -fu france-tycoon-import   (Ctrl+C pour arrêter de regarder)"
  echo "Savoir où il en est : systemctl is-active france-tycoon-import   (active = en cours, inactive = fini, failed = raté)"
}

main "$@"
