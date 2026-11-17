# Installe (ou vérifie) le poste d'un développeur France Tycoon sous Windows :
#   - Git, Node.js LTS et GitHub CLI (avec winget) ;
#   - connexion à GitHub et signature Git ;
#   - copie du projet, sur la branche dev.
#
# Deux façons de le lancer :
#   - le projet n'est pas encore sur ce PC : ouvrir le Terminal (clic droit sur Démarrer > Terminal) et coller
#       irm https://raw.githubusercontent.com/Ivar-lordbrock/france-tycoon/dev/outils/moteur/installer.ps1 | iex
#   - le projet est déjà là : double-clic sur outils\1-installer-mon-poste.bat (relançable sans risque).
#
# Options : -Essai (montre ce qui serait fait, sans rien installer ni modifier),
#           -Projet <dossier du projet déjà copié>, -Dossier <où copier le projet>.
#
# Ce fichier est en UTF-8 SANS BOM : « irm | iex » ne supporte pas le BOM. Le .bat le lit donc explicitement en UTF-8.
# Pas de « exit » ici : avec « irm | iex », cela fermerait la fenêtre de l'utilisateur.

param(
  [switch]$Essai,
  [string]$Projet,
  [string]$Dossier
)

$Depot = 'Ivar-lordbrock/france-tycoon'
$NodeMinimum = [version]'22.18.0'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

function Titre($texte) { Write-Host ''; Write-Host $texte -ForegroundColor Cyan }
function Ok($texte) { Write-Host 'OK  ' -ForegroundColor Green -NoNewline; Write-Host $texte }
function Attention($texte) { Write-Host 'Attention  ' -ForegroundColor Yellow -NoNewline; Write-Host $texte }
function Info($texte) { Write-Host "    $texte" }
function Arret($texte) {
  Write-Host ''
  Write-Host 'Stop  ' -ForegroundColor Red -NoNewline
  Write-Host $texte
  throw 'arret-propre'
}

function Demander($question, $defaut) {
  if ($Essai) { return $defaut }
  $reponse = Read-Host "$question (Entrée = $defaut)"
  if ([string]::IsNullOrWhiteSpace($reponse)) { return $defaut }
  return $reponse.Trim()
}

function Oui($question) {
  if ($Essai) { return $false }
  $reponse = Read-Host "$question (O/n)"
  return ($reponse -notmatch '^\s*[nN]')
}

function Trouver($commande) {
  $trouve = Get-Command $commande -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($trouve) { return $trouve.Source }
  return $null
}

# Ajoute au PATH de cette fenêtre ce que les installations viennent d'ajouter (sans rouvrir la fenêtre).
function Actualiser-Chemins {
  $actuels = $env:Path -split ';'
  $nouveaux = @()
  $nouveaux += [Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';'
  $nouveaux += [Environment]::GetEnvironmentVariable('Path', 'User') -split ';'
  $nouveaux += @(
    "$env:ProgramFiles\Git\cmd",
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\GitHub CLI",
    "$env:LOCALAPPDATA\Programs\Git\cmd",
    "$env:LOCALAPPDATA\Programs\GitHub CLI"
  )
  foreach ($dossier in $nouveaux) {
    if ($dossier -and ($actuels -notcontains $dossier) -and (Test-Path $dossier)) {
      $env:Path = "$env:Path;$dossier"
      $actuels += $dossier
    }
  }
}

function Installer-Outil($nom, $idWinget, $commande) {
  if (Trouver $commande) { Ok "$nom est déjà installé."; return }
  if ($Essai) { Ok "[essai] J'installerais $nom (winget install --id $idWinget)."; return }
  if (-not (Trouver 'winget')) {
    Arret "winget est introuvable. Ouvre le Microsoft Store, mets à jour « Programme d'installation d'application », puis relance."
  }
  Info "Installation de $nom... Windows peut demander l'autorisation : clique sur Oui."
  & winget install --id $idWinget --exact --source winget --accept-package-agreements --accept-source-agreements --silent
  Actualiser-Chemins
  if (Trouver $commande) { Ok "$nom installé." }
  else { Arret "L'installation de $nom n'a pas abouti. Redémarre le PC, puis relance cet outil." }
}

function Verifier-Node {
  $version = [version]((& node --version) -replace '^v', '')
  if ($version -ge $NodeMinimum) { Ok "Node.js $version : assez récent."; return }
  if ($Essai) { Attention "[essai] Node.js $version est trop ancien (il faut $NodeMinimum ou plus) : je le mettrais à jour."; return }
  Info "Node.js $version est trop ancien (il faut $NodeMinimum ou plus) : mise à jour..."
  & winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements --silent
  Actualiser-Chemins
  $version = [version]((& node --version) -replace '^v', '')
  if ($version -ge $NodeMinimum) { Ok "Node.js $version installé." }
  else { Attention "Node.js est toujours en version $version. Installe la version LTS depuis https://nodejs.org, puis relance." }
}

function Connecter-GitHub {
  & gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -eq 0) { Ok 'Connecté à GitHub.'; return $true }
  if ($Essai) { Ok "[essai] Je lancerais la connexion à GitHub (gh auth login)."; return $false }
  Titre 'Connexion à GitHub'
  Info "1. Un code à 8 caractères va s'afficher ici : note-le."
  Info "2. Appuie sur Entrée : une page GitHub s'ouvre dans ton navigateur."
  Info "3. Connecte-toi, colle le code, puis clique sur « Authorize »."
  Info "Si on te demande « Authenticate Git with your GitHub credentials? », réponds Y."
  & gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { Arret "La connexion à GitHub n'a pas abouti. Relance cet outil pour réessayer." }
  & gh auth setup-git *> $null
  Ok 'Connecté à GitHub.'
  return $true
}

function Regler-Signature($connecte) {
  $nom = & git config --global user.name
  $email = & git config --global user.email
  if ($nom -and $email) { Ok "Signature Git : $nom."; return }
  if ($Essai -or -not $connecte) { Ok "[essai] Je réglerais ta signature Git (ton nom + ton adresse privée GitHub)."; return }
  $moi = & gh api user | ConvertFrom-Json
  if (-not $nom) {
    $propose = if ($moi.name) { $moi.name } else { $moi.login }
    $nom = Demander 'Ton nom, pour signer ton travail' $propose
    & git config --global user.name $nom
  }
  if (-not $email) { & git config --global user.email "$($moi.id)+$($moi.login)@users.noreply.github.com" }
  Ok "Signature Git : $nom (avec ton adresse privée GitHub, pas ton vrai e-mail)."
}

function Verifier-Acces($connecte) {
  if (-not $connecte) { return }
  $ecriture = & gh api "repos/$Depot" --jq '.permissions.push'
  if ($ecriture -eq 'true') { Ok "Tu as le droit d'écrire sur le dépôt $Depot."; return }
  $invitations = & gh api user/repository_invitations | ConvertFrom-Json
  $invitation = $null
  foreach ($i in $invitations) { if ($i.repository.full_name -eq $Depot) { $invitation = $i } }
  if ($invitation) {
    if ($Essai) { Ok "[essai] Je proposerais d'accepter ton invitation au dépôt."; return }
    if (Oui "Une invitation au dépôt $Depot t'attend. L'accepter maintenant ?") {
      & gh api -X PATCH "user/repository_invitations/$($invitation.id)" *> $null
      if ($LASTEXITCODE -eq 0) { Ok 'Invitation acceptée : tu peux maintenant envoyer ton travail.' }
      else { Attention "Je n'ai pas pu accepter l'invitation. Accepte-la sur https://github.com/$Depot/invitations" }
    }
    return
  }
  Attention "Tu n'as pas encore le droit d'écrire sur le dépôt. Demande au propriétaire (Ivar-lordbrock) de t'inviter, puis relance cet outil. La copie du projet marche quand même."
}

function Copier-Projet {
  if ($Projet -and (Test-Path (Join-Path $Projet '.git'))) {
    $racine = (Resolve-Path $Projet).Path
    Ok "Projet déjà présent : $racine"
    return @{ Racine = $racine; Nouveau = $false }
  }
  $defaut = if ($Dossier) { $Dossier } else { Join-Path $HOME 'france-tycoon' }
  $cible = Demander 'Dans quel dossier copier le projet ?' $defaut
  if (Test-Path (Join-Path $cible '.git')) {
    Ok "Projet déjà présent : $cible"
    return @{ Racine = $cible; Nouveau = $false }
  }
  if ((Test-Path $cible) -and (Get-ChildItem $cible -Force | Select-Object -First 1)) {
    Arret "Le dossier $cible existe déjà et n'est pas vide. Relance et choisis un autre dossier."
  }
  if ($Essai) { Ok "[essai] Je copierais le projet dans $cible."; return @{ Racine = $null; Nouveau = $false } }
  Info "Copie du projet dans $cible..."
  & gh repo clone $Depot $cible
  if ($LASTEXITCODE -ne 0) { Arret "La copie du projet a échoué. Vérifie ta connexion internet, puis relance." }
  & git -C $cible switch dev *> $null
  Ok "Projet copié dans $cible (branche dev)."
  return @{ Racine = $cible; Nouveau = $true }
}

function Installer-Dependances($racine) {
  if (-not $racine -or -not (Test-Path (Join-Path $racine 'package.json'))) { return }
  if (Test-Path (Join-Path $racine 'node_modules')) { Ok 'Dépendances du projet déjà installées.'; return }
  if ($Essai) { Ok "[essai] J'installerais les dépendances du projet (npm install)."; return }
  Info "Installation des dépendances du projet (npm install), ça peut prendre une minute..."
  Push-Location $racine
  & npm.cmd install --no-fund --no-audit
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -eq 0) { Ok 'Dépendances installées.' }
  else { Attention "npm install a échoué. Demande à Claude de regarder." }
}

function Creer-Raccourci($racine) {
  if ($Essai -or -not $racine) { return }
  $outils = Join-Path $racine 'outils'
  $lanceur = Join-Path $outils '0-ouvrir-les-outils.bat'
  if (-not (Test-Path $lanceur)) { return }
  $lien = Join-Path ([Environment]::GetFolderPath('Desktop')) 'France Tycoon.lnk'
  if (Test-Path $lien) { Ok 'Raccourci « France Tycoon » déjà présent sur le Bureau.'; return }
  if (Oui 'Créer un raccourci « France Tycoon » sur le Bureau (il ouvre la fenêtre des outils) ?') {
    $raccourci = (New-Object -ComObject WScript.Shell).CreateShortcut($lien)
    $raccourci.TargetPath = $lanceur
    $raccourci.WorkingDirectory = $outils
    $raccourci.WindowStyle = 7
    $raccourci.Description = 'France Tycoon : outils du duo'
    $icone = Join-Path $outils 'moteur\icone.ico'
    if (Test-Path $icone) { $raccourci.IconLocation = "$icone,0" }
    $raccourci.Save()
    Ok 'Raccourci « France Tycoon » créé sur le Bureau.'
  }
}

function Installer-Poste {
  Titre "Installation du poste France Tycoon$(if ($Essai) { ' (essai : rien ne sera modifié)' })"
  Actualiser-Chemins

  Titre '1. Les logiciels'
  Installer-Outil 'Git' 'Git.Git' 'git'
  Installer-Outil 'Node.js LTS' 'OpenJS.NodeJS.LTS' 'node'
  if (Trouver 'node') { Verifier-Node }
  Installer-Outil 'GitHub CLI' 'GitHub.cli' 'gh'

  Titre '2. GitHub'
  $connecte = $false
  if (Trouver 'gh') { $connecte = Connecter-GitHub }
  if (Trouver 'git') { Regler-Signature $connecte }
  Verifier-Acces $connecte

  Titre '3. Le projet'
  $projet = Copier-Projet
  Installer-Dependances $projet.Racine
  Creer-Raccourci $projet.Racine

  Titre 'Tout est prêt.'
  if ($projet.Racine) { Info "Le projet est dans : $($projet.Racine)" }
  Info 'Pour travailler : double-clique sur « France Tycoon » sur le Bureau'
  Info '(ou sur 0-ouvrir-les-outils, dans le dossier outils du projet) : une fenêtre avec de gros boutons s''ouvre.'
  Info 'Avec Claude : ouvre le dossier du projet dans Claude (onglet Code) et tape /commencer, /envoyer...'
  Info 'Claude se télécharge sur https://claude.ai/download'
  Info 'Guide pas à pas : docs\07-travailler-a-deux.md'
  $lanceur = if ($projet.Racine) { Join-Path $projet.Racine 'outils\0-ouvrir-les-outils.bat' }
  if ($projet.Nouveau -and $lanceur -and (Test-Path $lanceur)) {
    Start-Process -FilePath $lanceur -WorkingDirectory (Split-Path $lanceur) -WindowStyle Minimized
  }
}

try {
  Installer-Poste
} catch {
  if ("$_" -ne 'arret-propre') {
    Write-Host ''
    Write-Host 'Erreur inattendue : ' -ForegroundColor Red -NoNewline
    Write-Host "$_"
    Write-Host 'Copie ce message et demande à Claude (ou à ton binôme) de regarder.'
  }
}
