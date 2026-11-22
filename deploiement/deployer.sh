#!/usr/bin/env bash
# Met le jeu à jour sur le serveur : dernière version de la branche suivie (main), dépendances,
# site du jeu (frontend/dist), redémarrage, puis vérifie que le jeu répond.
#
# Lancé par GitHub après chaque fusion dans main (.github/workflows/deploiement.yml), ou à la main :
#   sudo -u france-tycoon -H bash /srv/france-tycoon/app/deploiement/deployer.sh
set -euo pipefail

# Tout est dans une fonction : bash lit le fichier en entier avant que git ne le remplace.
main() {
  local app=/srv/france-tycoon/app branche essai
  export PATH=/usr/bin:/usr/sbin:/bin:/sbin
  cd "$app"

  # Un seul déploiement à la fois.
  exec 9>/srv/france-tycoon/.deploiement.lock
  flock 9

  branche=$(git rev-parse --abbrev-ref HEAD)
  echo "== Récupération de la branche $branche"
  git fetch --quiet origin "$branche"
  git reset --quiet --hard FETCH_HEAD
  git log -1 --format='Version : %h %s (%cd)' --date=format:'%d/%m/%Y %H:%M'

  # Seulement si la liste des dépendances a changé : npm ci vide node_modules pendant que le jeu tourne.
  if ! cmp -s package-lock.json node_modules/.lock-installe; then
    echo "== Dépendances"
    npm ci --no-audit --no-fund --loglevel=error
    cp package-lock.json node_modules/.lock-installe
  fi

  echo "== Site du jeu"
  # Construit à côté puis remplace d'un coup : les joueurs ne voient jamais un site à moitié construit.
  rm -rf frontend/dist-nouveau frontend/dist-ancien
  npm run build -w frontend -- --outDir dist-nouveau --logLevel warn
  if [[ -d frontend/dist ]]; then mv frontend/dist frontend/dist-ancien; fi
  mv frontend/dist-nouveau frontend/dist

  echo "== Redémarrage"
  sudo /usr/bin/systemctl restart france-tycoon.service
  for essai in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/api/v1/admin/health; then
      echo "Le jeu répond (après $essai s)."
      return 0
    fi
    sleep 1
  done
  echo "Le jeu ne répond pas. Pour voir pourquoi : sudo journalctl -u france-tycoon -n 50" >&2
  exit 1
}

main "$@"
