# tools/run-hbl.ps1  (PowerShell) — run from repo root
# Why: quick preflight so you can stay in PowerShell without WSL

$ErrorActionPreference = "Stop"

function Fail($msg){ Write-Error $msg; exit 1 }

# 1) Docker CLI check
try {
  docker version | Out-Null
} catch {
  Write-Host "Docker CLI not found in PowerShell."
  Write-Host "Fixes:"
  Write-Host " - Ensure Docker Desktop is running."
  Write-Host " - Close & reopen PowerShell (PATH refresh)."
  Write-Host " - Docker Desktop > Settings > Resources > WSL integration: enable your distro."
  Write-Host " - Or run from WSL:  wsl  -d <YourDistro> "
  exit 1
}

# 2) Optional: avoid OneDrive path issues
$path = (Get-Location).Path
if ($path -match "(?i)OneDrive") {
  Write-Warning "Repo is under OneDrive. Vite file-watching can be flaky/slow. Consider C:\dev\hyphae-engineering"
}

# 3) Build + up + sanity checks
Write-Host "`n== Build (Node 22) =="
docker compose --profile hbl build --no-cache hyphae-block-library-frontend

Write-Host "`n== Up frontend =="
docker compose --profile hbl up -d hyphae-block-library-frontend

Write-Host "`n== PS / Logs =="
docker compose --profile hbl ps
docker compose --profile hbl logs --tail=100 hyphae-block-library-frontend

# 4) Check modules inside container
$cmd = "sh -lc 'sh tools/check-modules.sh || (chmod +x tools/check-modules.sh && sh tools/check-modules.sh)'"
docker compose --profile hbl exec hyphae-block-library-frontend $cmd

Write-Host "`nDone. Open http://localhost:5173"
