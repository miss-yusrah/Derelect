#!/usr/bin/env bash
# Deploy the DERELICT web app to GitHub Pages (https://miss-yusrah.github.io/Derelect/).
set -euo pipefail
cd "$(dirname "$0")/../apps/web"

pnpm build >/dev/null 2>&1  # warm build (typecheck) first
VITE_BASE="/Derelect/" pnpm build 2>&1 | tail -2

cd dist
touch .nojekyll
if [ -d .git ]; then
  rm -rf .git
fi
git init -b gh-pages >/dev/null
git add -A
git -c user.name="derelict-deploy" -c user.email="deploy@derelict.invalid" \
  commit -q -m "deploy: web build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin https://github.com/miss-yusrah/Derelect.git 2>/dev/null || true
git push -f origin gh-pages
echo "Hosted at https://miss-yusrah.github.io/Derelect/ (enable Pages on gh-pages branch if needed)"
