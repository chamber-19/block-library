# FILE: tools/fix-git-remote.ps1
# Usage:
#   PowerShell (from repo root):  .\tools\fix-git-remote.ps1
#   Or specify remote:            .\tools\fix-git-remote.ps1 -RemoteUrl "https://github.com/YourOrg/YourRepo.git"
param(
  [string]$RemoteUrl
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[i] $m" -ForegroundColor Cyan }
function Warn($m){ Write-Warning $m }
function Fail($m){ Write-Error $m; exit 1 }

# 0) Ensure we're in a git repo (or init)
if (-not (Test-Path -LiteralPath ".git")) {
  Warn ".git not found here. Initializing a new repo."
  git init | Out-Null
}

# 1) Basic repo info
$repoPath = (Get-Location).Path
Info "Repo: $repoPath"
$branch = (git rev-parse --abbrev-ref HEAD) 2>$null
if (-not $branch) { $branch = "main"; git checkout -b $branch | Out-Null }
Info "Current branch: $branch"

# 2) Read existing origin (if any)
$existingOrigin = (git remote get-url origin) 2>$null
if ($existingOrigin) {
  Info "Existing origin: $existingOrigin"
} else {
  Info "No origin remote set."
}

# 3) Get/confirm remote URL
if (-not $RemoteUrl) {
  if ($existingOrigin) {
    $RemoteUrl = $existingOrigin
  } else {
    $RemoteUrl = Read-Host "Enter remote URL (e.g. https://github.com/YourOrg/YourRepo.git)"
    if (-not $RemoteUrl) { Fail "Remote URL is required." }
  }
}

# 4) Apply origin
if ($existingOrigin) {
  if ($existingOrigin -ne $RemoteUrl) {
    Info "Updating origin URL..."
    git remote set-url origin $RemoteUrl
  } else {
    Info "Origin already points to desired URL."
  }
} else {
  Info "Adding origin..."
  git remote add origin $RemoteUrl
}

# 5) Optional: rename master -> main
if ($branch -eq "master") {
  Info "Renaming 'master' -> 'main'..."
  git branch -m master main
  $branch = "main"
}

# 6) Mark this path safe for Git (Windows path normalization)
$norm = $repoPath -replace '\\','/'
Info "Marking safe.directory: $norm"
git config --global --add safe.directory $norm

# 7) Helpful defaults (non-destructive)
git config --global fetch.prune true
git config --global pull.rebase false
git config --global core.autocrlf true

# 8) Show status & remotes
Info "Remotes:"
git remote -v
Info "Status:"
git status --short

# 9) First push with upstream (skips if nothing to commit)
try {
  if (-not (git rev-parse --verify HEAD 2>$null)) {
    Warn "No commits yet. Add/commit before pushing:"
    Write-Host '  git add -A'
    Write-Host '  git commit -m "initial commit after move"'
    Write-Host "  git push -u origin $branch"
  } else {
    Info "Pushing to origin/$branch (sets upstream)..."
    git push -u origin $branch
  }
} catch {
  Warn "Push failed (likely no commits or auth not configured). Resolve then run:"
  Write-Host "  git push -u origin $branch"
}

Info "Done."
