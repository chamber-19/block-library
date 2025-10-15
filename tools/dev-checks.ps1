# ==============================
# FILE: tools/dev-checks.ps1
# Why: Windows equivalents for missing 'netstat' and quick Vite/Docker checks.
# Usage: PowerShell at repo root:  .\tools\dev-checks.ps1
# ==============================
# Ensure docker on PATH (session)
$paths=@("C:\Program Files\Docker\Docker\resources\bin","C:\Program Files\Docker\Docker\cli-plugins")|?{Test-Path $_}; if($paths){$env:Path+=";"+($paths -join ";")}

Write-Host "`n== Docker/Vite logs (frontend) ==" -ForegroundColor Cyan
docker compose --profile hbl logs --tail=120 hyphae-block-library-frontend

Write-Host "`n== Port 5173 listeners ==" -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -Property LocalAddress,LocalPort,OwningProcess,State

Write-Host "`n== HTTP check index.html ==" -ForegroundColor Cyan
try { (Invoke-WebRequest http://localhost:5173/ -UseBasicParsing).StatusCode } catch { $_.Exception.Message }

Write-Host "`n== HTTP check main.tsx (compiled) ==" -ForegroundColor Cyan
try { (Invoke-WebRequest http://localhost:5173/src/main.tsx -UseBasicParsing).StatusCode } catch { $_.Exception.Message }

Write-Host "`nTip: In the browser console, run  window.__downloadLogs()  to save logs." -ForegroundColor Yellow
