# Télécharge les données Tesseract « fast » (fra, eng, ara) pour l'OCR Tess4J (docs/round2-contract.md §2.2).
# Usage : .\BackEnd\scripts\fetch-tessdata.ps1 [-Target <dossier>]   (par défaut : BackEnd\tessdata)
# Idempotent : un fichier existant de plus de 100 Ko est conservé. Chaque fichier est vérifié par SHA-256.
param(
    [string]$Target = (Join-Path $PSScriptRoot '..\tessdata')
)

$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0'
$SumsFile = Join-Path $PSScriptRoot 'tessdata.sha256'
$Languages = @('fra', 'eng', 'ara')
$MinBytes = 102400

$sums = @{}
foreach ($line in Get-Content -LiteralPath $SumsFile) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Length -ge 2) { $sums[$parts[1]] = $parts[0].ToLowerInvariant() }
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null
$Target = (Resolve-Path -LiteralPath $Target).Path
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

foreach ($lang in $Languages) {
    $name = "$lang.traineddata"
    $file = Join-Path $Target $name
    if (-not $sums.ContainsKey($name)) {
        Write-Error "Empreinte SHA-256 absente pour $name dans $SumsFile."
        exit 1
    }
    if ((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Length -gt $MinBytes)) {
        Write-Host "Déjà présent : $name"
    } else {
        Write-Host "Téléchargement de $name…"
        $part = "$file.part"
        Invoke-WebRequest -Uri "$BaseUrl/$name" -OutFile $part -UseBasicParsing
        Move-Item -LiteralPath $part -Destination $file -Force
    }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $sums[$name]) {
        Remove-Item -LiteralPath $file -Force
        Write-Error "Empreinte SHA-256 inattendue pour $name ; fichier supprimé."
        exit 1
    }
}
Write-Host "Données Tesseract prêtes dans $Target"
