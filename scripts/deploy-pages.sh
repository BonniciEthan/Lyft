#!/usr/bin/env bash
# Publish the Lyft Local web app (standalone edition: no server, data stays on each
# device) to GitHub Pages at https://bonniciethan.github.io/Lyft/.
#
#   bash scripts/deploy-pages.sh
#
# Runs the tests, builds client/dist-local and force-pushes it as a single commit to the
# gh-pages branch, which GitHub Pages serves over HTTPS. The deploy branch keeps no
# history; the source of truth is main.
set -euo pipefail
export PATH="$HOME/.local/opt/node/bin:$HOME/.local/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
VER="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$ROOT/client/package.json")"
NAME="$(git -C "$ROOT" log -1 --format=%an)"
EMAIL="$(git -C "$ROOT" log -1 --format=%ae)"

if [[ -n "$(git -C "$ROOT" status --porcelain -- client)" ]]; then
  echo "client/ has uncommitted changes; commit them first so the deploy matches main." >&2
  exit 1
fi

cd "$ROOT/client"
[[ -d node_modules ]] || npm ci --no-audit --no-fund
echo "==> Testing"
npm test --silent
echo "==> Building Lyft Local $VER ($SHA)"
npm run build:local

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cp -r dist-local/. "$OUT/"
touch "$OUT/.nojekyll" # serve files as-is, no Jekyll processing

cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy Lyft Local $VER ($SHA)"
echo "==> Publishing to gh-pages"
git push -q -f "$REMOTE" gh-pages
echo "Done: https://bonniciethan.github.io/Lyft/ (live within a minute or two)"
