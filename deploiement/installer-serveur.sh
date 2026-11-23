#!/usr/bin/env bash
# shellcheck disable=SC2154  # DOMAINE, B2_… : remplis par demander() (printf -v).
# Installe Kadastr sur un serveur Ubuntu 24.04 neuf (guide : docs/09-mise-en-ligne.md).
#
# À lancer avec sudo, une première fois pour tout installer, puis autant de fois que voulu
# pour changer un réglage (nom de domaine, clés de la sauvegarde…) : rien n'est cassé ni perdu.
#
#   sudo bash installer-serveur.sh
#
# Les réponses sont gardées dans /etc/france-tycoon/reglages.conf (lisible par root seulement).
# Chaque réglage peut aussi être donné à l'avance : sudo DOMAINE=jeu.exemple.fr bash installer-serveur.sh
#
# Réglages pour les essais (CI) seulement :
#   ESSAI=1               ne touche ni au pare-feu, ni aux redémarrages automatiques, ni à la mémoire d'appoint
#   DEPOT_URL, BRANCHE    dépôt et branche à installer (par défaut : GitHub, main)
#   SAUVEGARDE_DOSSIER    sauvegarde Litestream dans un dossier du serveur au lieu de Backblaze B2
set -euo pipefail

# Tout est dans une fonction : bash lit le fichier en entier avant de commencer.
main() {
  readonly UTILISATEUR=france-tycoon
  readonly DOSSIER=/srv/france-tycoon
  readonly APP="$DOSSIER/app"
  readonly DONNEES=/var/lib/france-tycoon
  readonly BASE="$DONNEES/france-tycoon.sqlite"
  readonly REGLAGES=/etc/france-tycoon/reglages.conf
  readonly NODE_MAJEURE=26
  readonly LITESTREAM_VERSION=0.5.18

  cd /
  if [[ $EUID -ne 0 ]]; then
    echo "À lancer avec sudo : sudo bash $0" >&2
    exit 1
  fi
  if ! grep -q 'VERSION_ID="24.04"' /etc/os-release; then
    echo "Attention : ce script est prévu pour Ubuntu 24.04." >&2
  fi

  lire_reglages
  installer_paquets
  installer_node
  installer_caddy
  installer_litestream
  creer_utilisateur
  recuperer_code
  ecrire_env
  ecrire_services
  ecrire_caddy
  ecrire_sauvegarde
  [[ "${ESSAI:-}" == 1 ]] || securiser
  limiter_journaux
  preparer_cle_deploiement
  premier_deploiement
  resume
}

etape() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# --- Réglages : variable d'environnement > réponse gardée > question ---------------------------
lire_reglages() {
  etape "Réglages"
  local -A deja=()
  if [[ -f $REGLAGES ]]; then
    local cle valeur
    while IFS='=' read -r cle valeur; do
      [[ $cle =~ ^[A-Z0-9_]+$ ]] && deja[$cle]=$(printf '%s' "$valeur" | sed "s/^'//; s/'$//")
    done <"$REGLAGES"
  fi

  demander DOMAINE "Nom de domaine du jeu (ex. jeu.exemple.fr)" obligatoire
  demander GOOGLE_CLIENT_ID "ID client Google de production (Entrée = plus tard)"
  demander AVIS_URL "Lien « Donner mon avis » : formulaire ou e-mail (Entrée = plus tard)"
  demander B2_BUCKET "Sauvegarde : nom du bucket Backblaze B2 (Entrée = plus tard)"
  demander B2_ENDPOINT "Sauvegarde : Endpoint du bucket (ex. s3.eu-central-003.backblazeb2.com)"
  demander B2_KEY_ID "Sauvegarde : keyID de la clé d'application"
  demander B2_APP_KEY "Sauvegarde : applicationKey de la clé d'application" secret
  DEPOT_URL=${DEPOT_URL:-${deja[DEPOT_URL]:-https://github.com/Ivar-lordbrock/france-tycoon.git}}
  BRANCHE=${BRANCHE:-${deja[BRANCHE]:-main}}
  SAUVEGARDE_DOSSIER=${SAUVEGARDE_DOSSIER:-${deja[SAUVEGARDE_DOSSIER]:-}}
  B2_ENDPOINT=${B2_ENDPOINT#https://}

  if [[ ! $DOMAINE =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "Nom de domaine invalide : « $DOMAINE » (lettres, chiffres, points et tirets seulement)." >&2
    exit 1
  fi

  install -d -m 700 /etc/france-tycoon
  (
    umask 077
    for cle in DOMAINE GOOGLE_CLIENT_ID AVIS_URL B2_BUCKET B2_ENDPOINT B2_KEY_ID B2_APP_KEY DEPOT_URL BRANCHE SAUVEGARDE_DOSSIER; do
      printf "%s='%s'\n" "$cle" "${!cle//\'/}"
    done >"$REGLAGES"
  )
}

# demander NOM "question" [obligatoire|secret]
demander() {
  local nom=$1 question=$2 mode=${3:-} valeur=${!1:-} defaut
  defaut=${deja[$nom]:-}
  if [[ -z $valeur && -t 0 ]]; then
    local affiche=$defaut
    [[ $mode == secret && -n $defaut ]] && affiche="déjà rempli"
    if [[ $mode == secret ]]; then
      read -r -s -p "$question${affiche:+ [$affiche]} : " valeur
      echo
    else
      read -r -p "$question${affiche:+ [$affiche]} : " valeur
    fi
  fi
  valeur=${valeur:-$defaut}
  if [[ $mode == obligatoire && -z $valeur ]]; then
    echo "Réglage obligatoire manquant : $nom" >&2
    exit 1
  fi
  printf -v "$nom" '%s' "$valeur"
}

# --- Logiciels ------------------------------------------------------------------------------
installer_paquets() {
  etape "Paquets du système"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg git sqlite3 ufw fail2ban unattended-upgrades \
    debian-keyring debian-archive-keyring apt-transport-https rclone
  timedatectl set-timezone Europe/Paris || true
}

installer_node() {
  etape "Node.js $NODE_MAJEURE"
  # /usr/bin/node : celui du service (un autre Node peut exister ailleurs, ex. /usr/local/bin).
  if /usr/bin/node --version 2>/dev/null | grep -q "^v$NODE_MAJEURE\."; then
    /usr/bin/node --version
    return
  fi
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJEURE.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
  /usr/bin/node --version
}

installer_caddy() {
  etape "Caddy (HTTPS automatique)"
  if command -v caddy >/dev/null; then
    caddy version
    return
  fi
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
  caddy version
}

installer_litestream() {
  etape "Litestream $LITESTREAM_VERSION (sauvegarde continue)"
  if litestream version 2>/dev/null | grep -q "$LITESTREAM_VERSION"; then
    litestream version
    return
  fi
  local arch deb
  case $(dpkg --print-architecture) in
    amd64) arch=x86_64 ;;
    arm64) arch=arm64 ;;
    *) echo "Processeur non prévu : $(dpkg --print-architecture)" >&2; exit 1 ;;
  esac
  deb=$(mktemp --suffix=.deb)
  curl -fsSL -o "$deb" \
    "https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION/litestream-$LITESTREAM_VERSION-linux-$arch.deb"
  dpkg -i "$deb"
  rm -f "$deb"
  # Le paquet peut apporter son propre service : on utilise le nôtre (france-tycoon-sauvegarde).
  systemctl disable --now litestream.service 2>/dev/null || true
  litestream version
}

# --- Utilisateur, code, réglages du jeu --------------------------------------------------------
creer_utilisateur() {
  etape "Utilisateur $UTILISATEUR"
  if ! id "$UTILISATEUR" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "$DOSSIER" --shell /bin/bash "$UTILISATEUR"
  fi
  # Pas de mot de passe : connexion par clé SSH seulement.
  usermod -p '*' "$UTILISATEUR"
  install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 750 "$DOSSIER" "$DONNEES"
  # Le déploiement peut seulement redémarrer le jeu, rien d'autre.
  cat >/etc/sudoers.d/france-tycoon <<EOF
$UTILISATEUR ALL=(root) NOPASSWD: /usr/bin/systemctl restart france-tycoon.service
EOF
  chmod 440 /etc/sudoers.d/france-tycoon
  visudo -cf /etc/sudoers.d/france-tycoon >/dev/null
}

recuperer_code() {
  etape "Code du jeu ($BRANCHE)"
  if [[ ! -d $APP/.git ]]; then
    sudo -u "$UTILISATEUR" git clone --branch "$BRANCHE" "$DEPOT_URL" "$APP"
  else
    sudo -u "$UTILISATEUR" git -C "$APP" remote set-url origin "$DEPOT_URL"
  fi
}

ecrire_env() {
  etape "Fichier .env du jeu"
  local env="$APP/.env"
  # Les réglages de la carte restent ceux de .env.example (fond OpenStreetMap) s'ils ne sont pas déjà changés.
  local tuiles attribution
  tuiles=$(lire_env "$env" VITE_TILE_URL || lire_env "$APP/.env.example" VITE_TILE_URL)
  attribution=$(lire_env "$env" VITE_TILE_ATTRIBUTION || lire_env "$APP/.env.example" VITE_TILE_ATTRIBUTION)
  (
    umask 027
    cat >"$env" <<EOF
# Écrit par deploiement/installer-serveur.sh : relancer ce script pour changer un réglage.
# NODE_ENV=production est donné par le service systemd (france-tycoon.service).
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://$DOMAINE
TZ=Europe/Paris
LOG_LEVEL=info
DATABASE_PATH=$BASE
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
AUTH_DEV=false
VITE_TILE_URL=$tuiles
VITE_TILE_ATTRIBUTION=$attribution
VITE_AVIS_URL=$AVIS_URL
EOF
  )
  chown "$UTILISATEUR:$UTILISATEUR" "$env"
}

# lire_env FICHIER CLÉ : affiche la valeur (telle qu'écrite) ou échoue si absente
lire_env() {
  [[ -f $1 ]] || return 1
  local ligne
  ligne=$(grep -m1 "^$2=" "$1") || return 1
  printf '%s\n' "${ligne#*=}"
}

# --- Services ---------------------------------------------------------------------------------
ecrire_services() {
  etape "Services (démarrage automatique)"
  install -m 644 "$APP/deploiement/france-tycoon.service" /etc/systemd/system/france-tycoon.service
  install -m 644 "$APP/deploiement/france-tycoon-sauvegarde.service" /etc/systemd/system/france-tycoon-sauvegarde.service
  install -m 644 "$APP/deploiement/france-tycoon-sauvegarde-drive.service" /etc/systemd/system/france-tycoon-sauvegarde-drive.service
  install -m 644 "$APP/deploiement/france-tycoon-sauvegarde-drive.timer" /etc/systemd/system/france-tycoon-sauvegarde-drive.timer
  # Copié hors du dossier du jeu : root le lance, le jeu ne doit pas pouvoir le modifier.
  install -m 755 "$APP/deploiement/sauvegarde-drive.sh" /usr/local/sbin/kadastr-sauvegarde-drive
  systemctl daemon-reload
  systemctl enable france-tycoon.service
  # Google Drive se branche à la main, une fois (docs/09-mise-en-ligne.md) ; ensuite, une copie par heure.
  if [[ -f /etc/france-tycoon/rclone.conf ]]; then
    systemctl enable --now france-tycoon-sauvegarde-drive.timer
  fi
}

ecrire_caddy() {
  etape "Caddy pour $DOMAINE"
  sed "s/DOMAINE_DU_JEU/$DOMAINE/g" "$APP/deploiement/Caddyfile" >/etc/caddy/Caddyfile
  # Sans entrée DNS pour www, Caddy réclamerait en vain un cadenas : on retire le bloc www.
  if ! getent ahostsv4 "www.$DOMAINE" >/dev/null; then
    sed -i '/^# Adresse en « www. »/,/^}/d' /etc/caddy/Caddyfile
  fi
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  # Caddy doit pouvoir lire les pages du jeu (frontend/dist), sans accès au reste.
  chmod 751 "$DOSSIER" "$APP"
  systemctl enable caddy
  systemctl reload-or-restart caddy
}

ecrire_sauvegarde() {
  etape "Sauvegarde continue (Litestream)"
  local destination
  if [[ -n $B2_BUCKET && -n $B2_ENDPOINT && -n $B2_KEY_ID && -n $B2_APP_KEY ]]; then
    destination="    replica:
      type: s3
      bucket: $B2_BUCKET
      path: france-tycoon
      endpoint: $B2_ENDPOINT
      access-key-id: $B2_KEY_ID
      secret-access-key: $B2_APP_KEY"
  elif [[ -n $SAUVEGARDE_DOSSIER ]]; then
    install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 750 "$SAUVEGARDE_DOSSIER"
    destination="    replica:
      type: file
      path: $SAUVEGARDE_DOSSIER"
  else
    echo "Clés Backblaze B2 pas encore données : sauvegarde pas encore active."
    echo "Relance ce script quand tu les as (docs/09-mise-en-ligne.md, étape 3)."
    systemctl disable --now france-tycoon-sauvegarde.service 2>/dev/null || true
    return
  fi
  (
    umask 027
    cat >/etc/litestream.yml <<EOF
# Écrit par deploiement/installer-serveur.sh. Copie complète chaque jour, gardée 7 jours,
# et chaque modification envoyée en quelques secondes entre deux copies.
snapshot:
  interval: 24h
  retention: 168h

dbs:
  - path: $BASE
$destination
EOF
  )
  chown "root:$UTILISATEUR" /etc/litestream.yml
  SAUVEGARDE_ACTIVE=1
}

securiser() {
  etape "Sécurité : pare-feu, mises à jour automatiques, anti-intrusion"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
  ufw --force enable
  cat >/etc/apt/apt.conf.d/52france-tycoon <<'EOF'
// Mises à jour de sécurité chaque jour ; redémarrage à 4 h si le système le demande.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
  systemctl enable --now fail2ban >/dev/null
  # Mémoire d'appoint : évite qu'une construction du site manque de mémoire.
  if ! swapon --show | grep -q .; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
}

# Les journaux du jeu contiennent les adresses IP des joueurs : effacés au bout de 30 jours
# (durée annoncée dans frontend/public/legal.html).
limiter_journaux() {
  etape "Journaux gardés 30 jours"
  install -d -m 755 /etc/systemd/journald.conf.d
  cat >/etc/systemd/journald.conf.d/france-tycoon.conf <<'EOF'
# Écrit par deploiement/installer-serveur.sh.
[Journal]
MaxRetentionSec=30day
EOF
  systemctl restart systemd-journald
}

# Clé SSH réservée à GitHub : elle ne peut que lancer deployer.sh.
preparer_cle_deploiement() {
  etape "Clé de déploiement pour GitHub"
  local ssh="$DOSSIER/.ssh" cle
  install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 700 "$ssh"
  touch "$ssh/authorized_keys"
  if grep -q 'cle-deploiement-github' "$ssh/authorized_keys"; then
    echo "Déjà prête (pour en refaire une : retirer sa ligne de $ssh/authorized_keys, puis relancer)."
  else
    cle=$(mktemp -d)
    ssh-keygen -q -t ed25519 -N '' -C cle-deploiement-github -f "$cle/cle"
    printf 'command="bash %s/deploiement/deployer.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' \
      "$APP" "$(cat "$cle/cle.pub")" >>"$ssh/authorized_keys"
    CLE_PRIVEE=$(cat "$cle/cle")
    rm -rf "$cle"
  fi
  chown "$UTILISATEUR:$UTILISATEUR" "$ssh/authorized_keys"
  chmod 600 "$ssh/authorized_keys"
}

premier_deploiement() {
  etape "Construction et démarrage du jeu"
  sudo -u "$UTILISATEUR" -H bash "$APP/deploiement/deployer.sh"
  if [[ -n ${SAUVEGARDE_ACTIVE:-} ]]; then
    systemctl enable france-tycoon-sauvegarde.service
    systemctl restart france-tycoon-sauvegarde.service
  fi
}

resume() {
  etape "C'est installé"
  echo "Le jeu : https://$DOMAINE (le cadenas HTTPS arrive dès que le nom de domaine pointe vers ce serveur)."
  if [[ -n ${SAUVEGARDE_ACTIVE:-} ]]; then
    echo "Sauvegarde continue : active. Vérifier : sudo bash $APP/deploiement/verifier-sauvegarde.sh"
  else
    echo "Sauvegarde continue : PAS ENCORE ACTIVE (clés Backblaze B2 manquantes)."
  fi
  if [[ -f /etc/france-tycoon/rclone.conf ]]; then
    echo "Copie chaque heure sur Google Drive : active. Vérifier : sudo kadastr-sauvegarde-drive verifier"
  fi
  [[ -n $GOOGLE_CLIENT_ID ]] || echo "Connexion Google : ID client manquant, relancer ce script pour l'ajouter."
  echo
  echo "Pour GitHub (Settings > Secrets and variables > Actions), voir docs/09-mise-en-ligne.md :"
  echo "  SERVEUR_EMPREINTE = $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
  if [[ -n ${CLE_PRIVEE:-} && ${ESSAI:-} != 1 ]]; then
    echo "  SERVEUR_CLE_SSH   = tout le bloc ci-dessous, lignes BEGIN et END comprises (affiché une seule fois) :"
    echo "$CLE_PRIVEE"
  fi
}

main "$@"
