# Build script pour version standalone avec Python embarqué
# Ce script crée un exécutable autonome qui ne nécessite pas d'installer Python

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  BUILD STANDALONE - Python Embarqué" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Configuration
$PythonVersion = "3.11.9"
$PythonEmbedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonDir = "python-embed"
$PythonZip = "python-embed.zip"

# Vérifier que le fichier .env existe
if (-not (Test-Path ".env")) {
    Write-Host "❌ ERREUR: Le fichier .env est manquant!" -ForegroundColor Red
    Write-Host "   Créez un fichier .env à la racine du projet avec vos tokens Discord" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Fichier .env trouvé" -ForegroundColor Green

# Nettoyer les anciens builds
Write-Host "`nNettoyage des caches et dossiers de build..." -ForegroundColor Yellow
@("dist", "release", "$env:USERPROFILE\AppData\Local\electron", "$env:USERPROFILE\AppData\Local\electron-builder\cache") | ForEach-Object {
    if (Test-Path $_) {
        Remove-Item $_ -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  $_ supprimé" -ForegroundColor Gray
    }
}

# Télécharger Python embarqué si nécessaire
if (-not (Test-Path $PythonDir)) {
    Write-Host "`nTéléchargement de Python embarqué $PythonVersion..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $PythonEmbedUrl -OutFile $PythonZip -UseBasicParsing
        Write-Host "✅ Python téléchargé" -ForegroundColor Green
        
        Write-Host "Extraction de Python..." -ForegroundColor Yellow
        Expand-Archive -Path $PythonZip -DestinationPath $PythonDir -Force
        Remove-Item $PythonZip -Force
        Write-Host "✅ Python extrait dans $PythonDir" -ForegroundColor Green
        
        # Activer pip dans Python embarqué
        $pthFile = Get-ChildItem -Path $PythonDir -Filter "*._pth" | Select-Object -First 1
        if ($pthFile) {
            $content = Get-Content $pthFile.FullName
            $content = $content -replace '#import site', 'import site'
            Set-Content $pthFile.FullName $content
            Write-Host "✅ pip activé" -ForegroundColor Green
        }
        
        # Télécharger get-pip.py
        Write-Host "Installation de pip..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile "$PythonDir\get-pip.py" -UseBasicParsing
        & "$PythonDir\python.exe" "$PythonDir\get-pip.py" --no-warn-script-location
        Remove-Item "$PythonDir\get-pip.py" -Force
        Write-Host "✅ pip installé" -ForegroundColor Green
        
        # Installer les dépendances
        Write-Host "Installation des dépendances Python..." -ForegroundColor Yellow
        & "$PythonDir\python.exe" -m pip install discord.py aiohttp python-dotenv --no-warn-script-location
        Write-Host "✅ Dépendances installées" -ForegroundColor Green
        
    } catch {
        Write-Host "❌ ERREUR lors du téléchargement/installation de Python" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n✅ Python embarqué déjà présent" -ForegroundColor Green
}

# Build du frontend
Write-Host "`nBuild du frontend React..." -ForegroundColor Yellow
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du build du frontend" -ForegroundColor Red
    exit 1
}
Set-Location ..
Write-Host "  Frontend buildé avec succès" -ForegroundColor Green

# Packaging Electron
Write-Host "`nPackaging de l'application Electron (version standalone)..." -ForegroundColor Yellow
$env:BUILD_STANDALONE = "true"
npm run pack
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du packaging Electron" -ForegroundColor Red
    exit 1
}
Remove-Item Env:\BUILD_STANDALONE

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  ✅ BUILD STANDALONE TERMINÉ!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nFichier créé: release\PublicationGenerator 1.0.0.exe" -ForegroundColor Cyan
Write-Host "Ce fichier contient:" -ForegroundColor White
Write-Host "  • Python embarqué" -ForegroundColor White
Write-Host "  • Toutes les dépendances Python" -ForegroundColor White
Write-Host "  • Le fichier .env avec vos tokens" -ForegroundColor White
Write-Host "`n⚠️  ATTENTION: Ne partagez pas cet exe publiquement" -ForegroundColor Yellow
Write-Host "   (contient vos tokens Discord)" -ForegroundColor Yellow
Write-Host "`nPour distribuer à un ami:" -ForegroundColor Cyan
Write-Host "  1. Donnez-lui l'exe" -ForegroundColor White
Write-Host "  2. Il double-clique dessus" -ForegroundColor White
Write-Host "  3. Ça fonctionne immédiatement! ✨" -ForegroundColor White
Write-Host ""
