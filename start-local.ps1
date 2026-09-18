# =============================================================================
# ZELQANE — local run without Docker (Windows)
#   0. portable JDK 21 in %LOCALAPPDATA%\zelqane-jdk (only to compile the backend once)
#   1. portable PostgreSQL in %LOCALAPPDATA%\zelqane-postgres (port 5432)
#   2. Spring Boot backend JAR (port 8080, profile "local": simulated player time), secrets from
#      .zelqane-local.secrets (generated on first run, gitignored), local AI analysis by default
#   3. Next.js frontend (port 3000)
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-local.ps1 [-Seed] [-Stop]
# =============================================================================
param(
  [switch]$Seed,
  [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$PgHome = Join-Path $env:LOCALAPPDATA "zelqane-postgres"
$PgBin = Join-Path $PgHome "pgsql\bin"
$PgData = Join-Path $PgHome "data"
$PgLog = Join-Path $PgHome "postgres.log"
$DbName = "zelqane"
$DbUser = "zelqane_user"
$DbPassword = "zelqane_local_dev"
$BackendLog = Join-Path $Root "BackEnd\backend.log"
$FrontendLog = Join-Path $Root "FrontEnd\frontend.log"

function Test-Port([int]$Port) {
  [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Stop-Port([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue }
}

function Wait-Http([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try { Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 5 | Out-Null; return $true } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}

if ($Stop) {
  Stop-Port 3000
  Stop-Port 8080
  # pg_ctl writes to stderr when the server is already stopped (stale postmaster.pid): not an error here.
  if ((Test-Path $PgData) -and (Test-Port 5432)) {
    $ErrorActionPreference = "Continue"
    & "$PgBin\pg_ctl.exe" -D $PgData stop -m fast 2>&1 | Out-Null
  }
  Write-Host "ZELQANE arrêté."
  exit 0
}

# --- 0. Local secrets (.zelqane-local.secrets, gitignored) ----------------------
# Generated on first run and reused afterwards: nothing secret lives in this script.
# The JWT secret once committed here is in git history: it is compromised and refused by the backend.
$SecretsFile = Join-Path $Root ".zelqane-local.secrets"

function New-HexSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function New-AdminPassword {
  # 20 characters, A-Za-z0-9 without the ambiguous 0 O 1 l I, at least one letter and one digit.
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    do {
      $bytes = New-Object byte[] 20
      $rng.GetBytes($bytes)
      $password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
    } while (-not ($password -match "[0-9]" -and $password -match "[A-Za-z]"))
  } finally { $rng.Dispose() }
  $password
}

function Get-LocalSecrets {
  $values = [ordered]@{}
  if (Test-Path $SecretsFile) {
    foreach ($line in Get-Content $SecretsFile) {
      if ($line -match "^\s*([A-Z_]+)=(.*)$") { $values[$Matches[1]] = $Matches[2] }
    }
  }
  $generators = [ordered]@{
    JWT_SECRET                  = { New-HexSecret }
    MEDIA_SIGNING_SECRET        = { New-HexSecret }
    TOTP_ENCRYPTION_KEY         = { New-HexSecret }
    ZELQANE_ADMIN_INITIAL_PASSWORD = { New-AdminPassword }
  }
  $changed = $false
  foreach ($key in $generators.Keys) {
    if (-not $values.Contains($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
      $values[$key] = & $generators[$key]
      $changed = $true
    }
  }
  if ($changed) {
    $content = @("# ZELQANE : secrets locaux generes par start-local.ps1 (ne jamais committer)")
    foreach ($key in $values.Keys) { $content += "$key=$($values[$key])" }
    Set-Content -Path $SecretsFile -Value $content -Encoding ascii
    Write-Host "Secrets locaux enregistrés dans .zelqane-local.secrets."
  }
  $values
}

# --- 1. PostgreSQL -----------------------------------------------------------
if (-not (Test-Path "$PgBin\pg_ctl.exe")) {
  throw "PostgreSQL portable introuvable dans $PgBin. Téléchargez https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip et extrayez-le dans $PgHome."
}
if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
  Write-Host "Initialisation du cluster PostgreSQL..."
  $pwFile = Join-Path $PgHome "pw.txt"
  Set-Content -Path $pwFile -Value $DbPassword -NoNewline -Encoding ascii
  & "$PgBin\initdb.exe" -D $PgData -U postgres --pwfile=$pwFile -A scram-sha-256 -E UTF8 --locale=C | Out-Null
  Remove-Item $pwFile -Force
}
if (-not (Test-Port 5432)) {
  Write-Host "Démarrage de PostgreSQL..."
  # Detached: calling pg_ctl directly keeps the console pipe open and hangs the script.
  Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("-D", "`"$PgData`"", "-l", "`"$PgLog`"", "-o", "`"-p 5432`"", "start") -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Port 5432) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Port 5432)) { throw "PostgreSQL ne démarre pas. Consultez $PgLog" }
}
# The port opens before recovery ends ("the database system is starting up"): wait for pg_isready.
$deadline = (Get-Date).AddSeconds(60)
do {
  & "$PgBin\pg_isready.exe" -h localhost -p 5432 -q
  $ready = ($LASTEXITCODE -eq 0)
  if (-not $ready) { Start-Sleep -Milliseconds 500 }
} while (-not $ready -and (Get-Date) -lt $deadline)
if (-not $ready) { throw "PostgreSQL n'accepte pas les connexions. Consultez $PgLog" }
$env:PGPASSWORD = $DbPassword
$roleExists = & "$PgBin\psql.exe" -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'"
if ($roleExists -ne "1") {
  & "$PgBin\psql.exe" -h localhost -U postgres -d postgres -c "CREATE ROLE $DbUser LOGIN PASSWORD '$DbPassword'" | Out-Null
}
$dbExists = & "$PgBin\psql.exe" -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($dbExists -ne "1") {
  & "$PgBin\psql.exe" -h localhost -U postgres -d postgres -c "CREATE DATABASE $DbName OWNER $DbUser" | Out-Null
}
Remove-Item Env:PGPASSWORD
Write-Host "PostgreSQL prêt (localhost:5432, base $DbName)."

# --- 2. Backend --------------------------------------------------------------
if (-not (Test-Port 8080)) {
  $jar = Get-ChildItem (Join-Path $Root "BackEnd\target") -Filter "*.jar" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*plain*" } | Select-Object -First 1
  if (-not $jar) {
    Write-Host "Compilation du backend (première fois)..."
    # Maven needs a JDK (javac); a portable Temurin 21 lives in %LOCALAPPDATA%\zelqane-jdk.
    $jdk = Get-ChildItem (Join-Path $env:LOCALAPPDATA "zelqane-jdk") -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName "bin\javac.exe") } | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName; $env:Path = "$($jdk.FullName)\bin;$env:Path" }
    Push-Location (Join-Path $Root "BackEnd")
    & .\mvnw.cmd -q -B -DskipTests package
    Pop-Location
    $jar = Get-ChildItem (Join-Path $Root "BackEnd\target") -Filter "*.jar" | Where-Object { $_.Name -notlike "*plain*" } | Select-Object -First 1
  }
  $env:SPRING_PROFILES_ACTIVE = "local"
  $env:DB_HOST = "localhost"
  $env:DB_PORT = "5432"
  $env:POSTGRES_DB = $DbName
  $env:SPRING_DATASOURCE_USERNAME = $DbUser
  $env:SPRING_DATASOURCE_PASSWORD = $DbPassword
  $secrets = Get-LocalSecrets
  $env:JWT_SECRET = $secrets["JWT_SECRET"]
  $env:MEDIA_SIGNING_SECRET = $secrets["MEDIA_SIGNING_SECRET"]
  $env:TOTP_ENCRYPTION_KEY = $secrets["TOTP_ENCRYPTION_KEY"]
  # Used only if the database has no active administrator yet (a new database).
  $env:ZELQANE_ADMIN_INITIAL_PASSWORD = $secrets["ZELQANE_ADMIN_INITIAL_PASSWORD"]
  $env:ZELQANE_ADMIN_MUST_CHANGE_PASSWORD = "false"
  if ([string]::IsNullOrWhiteSpace($env:ZELQANE_AI_PROVIDER)) { $env:ZELQANE_AI_PROVIDER = "local" }
  $tessdata = Join-Path $Root "BackEnd\tessdata"
  $env:ZELQANE_OCR_TESSDATA = $tessdata
  if (-not (Test-Path (Join-Path $tessdata "fra.traineddata"))) {
    Write-Host "OCR simulé : lancez BackEnd\scripts\fetch-tessdata.ps1 pour activer Tesseract"
  }
  $env:CORS_ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:4200"
  $env:MEDIA_UPLOAD_DIR = (Join-Path $Root "BackEnd\uploads")
  Write-Host "Démarrage du backend ($($jar.Name))..."
  Start-Process -FilePath "java" -ArgumentList @("-Xms128m", "-Xmx384m", "-jar", "`"$($jar.FullName)`"") `
    -WorkingDirectory (Join-Path $Root "BackEnd") -WindowStyle Hidden `
    -RedirectStandardOutput $BackendLog -RedirectStandardError "$BackendLog.err"
}
if (-not (Wait-Http "http://localhost:8080/actuator/health" 180)) {
  throw "Le backend ne répond pas. Consultez $BackendLog"
}
Write-Host "Backend prêt (http://localhost:8080, Swagger : /swagger-ui.html)."

# --- 3. Demo data ------------------------------------------------------------
if ($Seed) {
  Push-Location (Join-Path $Root "FrontEnd")
  node scripts/seed-demo.mjs
  Pop-Location
}

# --- 4. Frontend -------------------------------------------------------------
if (-not (Test-Port 3000)) {
  $fe = Join-Path $Root "FrontEnd"
  if (-not (Test-Path (Join-Path $fe ".next\BUILD_ID"))) {
    Write-Host "Build du frontend (première fois)..."
    Push-Location $fe; npm run build; Pop-Location
  }
  $env:ZELQANE_API_URL = "http://localhost:8080"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start > `"$FrontendLog`" 2>&1" -WorkingDirectory $fe -WindowStyle Hidden
}
if (-not (Wait-Http "http://localhost:3000/" 60)) { throw "Le frontend ne répond pas. Consultez $FrontendLog" }

Write-Host ""
Write-Host "ZELQANE est lancé : http://localhost:3000"
Write-Host "  Admin : admin@zelqane.local, mot de passe dans .zelqane-local.secrets (ZELQANE_ADMIN_INITIAL_PASSWORD) si la base a été créée par ce script ; une base existante garde son mot de passe"
Write-Host "  Comptes de démonstration (après -Seed) : mots de passe dans FrontEnd\scripts\.demo-accounts.json"
Write-Host "  Écrans : liens d'appairage affichés par -Seed (FrontEnd\scripts\.demo-device-keys.json)"
Write-Host "Arrêt : .\start-local.ps1 -Stop"
