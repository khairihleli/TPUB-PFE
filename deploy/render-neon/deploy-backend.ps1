# Redeploys the ZELQANE backend on Render from the pushed HEAD commit.
# The Render service is not connected to GitHub (the repo belongs to another account), so a push
# does not trigger a build by itself. Prerequisite: `render login` (token in ~/.render/cli.yaml).
# Usage: powershell -ExecutionPolicy Bypass -File deploy\render-neon\deploy-backend.ps1
$ErrorActionPreference = "Stop"
$ServiceId = "srv-damp5qad0e5s73d7b1fg"

$cli = Join-Path $env:USERPROFILE ".render\cli.yaml"
$token = (Select-String -Path $cli -Pattern "^\s+key:\s*(\S+)" | Select-Object -First 1).Matches[0].Groups[1].Value
if (-not $token) { throw "Token Render introuvable : lancez 'render login'." }

git fetch -q origin
$branch = git rev-parse --abbrev-ref HEAD
$commit = git rev-parse "origin/$branch"
if ((git rev-parse HEAD) -ne $commit) { throw "HEAD n'est pas poussé sur origin/$branch : faites git push d'abord." }

$body = @{ commitId = $commit; clearCache = "do_not_clear" } | ConvertTo-Json
$deploy = Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$ServiceId/deploys" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
Write-Host "Déploiement $($deploy.id) lancé pour $($commit.Substring(0, 7)) : https://dashboard.render.com/web/$ServiceId"
