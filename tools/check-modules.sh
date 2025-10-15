# -----------------------------------------
# FILE: Projects/Hyphae-Block-Library/tools/check-modules.sh
# (make sure it exists on host; no need to chmod on Windows, we'll call with sh)
# -----------------------------------------
set -euo pipefail
echo "Node: $(node -v)  NPM: $(npm -v || true)"
echo "cwd: $(pwd)"
echo "ls /app:"
ls -la /app | sed -n '1,120p'
echo "node_modules exists?"
ls -ld /app/node_modules || true
echo "Top-level deps (may warn in dev):"
npm ls --depth=0 || true
