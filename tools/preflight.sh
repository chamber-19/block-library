# FILE: Projects/Hyphae-Block-Library/tools/preflight.sh  (project)
set -euo pipefail
echo "Node: $(node -v)  npm: $(npm -v || true)"
echo "Vite config present?"; test -f vite.config.ts && echo "yes" || echo "NO"
echo "tsconfig paths:"; node -e "const ts=require('./tsconfig.json'); console.log(JSON.stringify(ts.compilerOptions?.paths||{},null,2))"
echo "Check key files:"; for f in src/main.tsx src/App.tsx index.html; do [ -f "$f" ] && echo "ok $f" || echo "MISSING $f"; done
echo "Resolve '@/components' (if used):"
node -e "try{require('fs').accessSync('./src/components');console.log('components dir OK')}catch(e){console.log('no components dir (ok if unused)')}"
echo "Typecheck (no emit):"; npx -y tsc --noEmit -p tsconfig.app.json || true
