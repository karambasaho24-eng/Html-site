# ---------------------------------------------------------------------------
# Mettre le site en ligne, en un mot.
#
#   .\deployer.ps1
#
# Le projet Netlify n'est relié à aucun dépôt : rien ne part tout seul quand on
# pousse. Plutôt que de recopier deux commandes dont l'une tient sur quinze
# lignes — recopiage qui rate une fois sur trois et qui, surtout, décourage de
# publier —, on les range ici.
#
# Le jeton de publication ne figure PAS dans ce fichier, et ne doit jamais y
# figurer : le dépôt est public, et quiconque le lirait pourrait déposer ce
# qu'il veut sur le site. Il se met une seule fois dans jeton-netlify.txt,
# resté à côté et ignoré par git.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$siteId     = "8339d1ea-52db-46ff-901a-fe2eec30cf98"
$fichierJeton = Join-Path $PSScriptRoot "jeton-netlify.txt"

if (-not (Test-Path $fichierJeton)) {
  Write-Host ""
  Write-Host "Il manque le jeton de publication." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Creez un fichier nomme  jeton-netlify.txt  dans ce dossier, et"
  Write-Host "collez-y l'adresse complete qui commence par :"
  Write-Host ""
  Write-Host "    https://netlify-mcp.netlify.app/proxy/..." -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "Une seule ligne, rien d'autre. Ce fichier reste sur votre machine :"
  Write-Host "git l'ignore, il ne partira jamais dans le depot."
  Write-Host ""
  exit 1
}

$proxy = (Get-Content $fichierJeton -Raw).Trim()

if (-not $proxy.StartsWith("https://")) {
  Write-Host ""
  Write-Host "Le contenu de jeton-netlify.txt ne ressemble pas a une adresse." -ForegroundColor Yellow
  Write-Host "Il doit commencer par https:// et tenir sur une seule ligne."
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "1/2  Je recupere les dernieres modifications..." -ForegroundColor Cyan
git pull

Write-Host ""
Write-Host "     Version a publier : $(git log --oneline -1)" -ForegroundColor DarkGray

Write-Host ""
Write-Host "2/2  Je publie sur Netlify..." -ForegroundColor Cyan
npx -y "@netlify/mcp@latest" --site-id $siteId --proxy-path $proxy

# $ErrorActionPreference ne voit pas l'echec d'un programme externe : sans ce
# test, le script annoncait « Termine » juste apres un 401. Une bonne nouvelle
# fausse est pire qu'une erreur.
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "ECHEC : rien n'a ete publie." -ForegroundColor Red
  Write-Host ""
  Write-Host "Si le message ci-dessus dit 401 Unauthorized, le jeton a expire" -ForegroundColor Yellow
  Write-Host "— ils ne durent que quelques heures. Demandez-m'en un neuf, et"
  Write-Host "remplacez le contenu de jeton-netlify.txt."
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "Publie.  https://classe-parallele.netlify.app" -ForegroundColor Green
Write-Host "Version : $(git log --oneline -1)" -ForegroundColor DarkGray
Write-Host ""
