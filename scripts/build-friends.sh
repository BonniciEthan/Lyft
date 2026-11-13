#!/usr/bin/env bash
# Build "Lyft Local", the standalone edition for friends: no server, no sync, starts
# empty, and all data stays on their own computer. The downloads are collected in ~/Lyft/friends/
# and also copied to ~/Lyft/downloads/, so the Lyft server offers them at /downloads.
#
#   bash scripts/build-friends.sh
set -euo pipefail
export PATH="$HOME/.local/opt/node/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/client"
OUT="$ROOT/friends"
DL="$ROOT/downloads"
VER="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$APP/src-tauri/tauri.local.conf.json")"
NAME="Lyft-Local-${VER}"

mkdir -p "$OUT" "$DL"
cd "$APP"
[[ -d node_modules ]] || npm install --no-audit --no-fund

echo "==> Building Linux (AppImage + .deb)"
npm run tauri:build:local

B="$APP/src-tauri/target/release/bundle"
rm -f "$OUT"/Lyft-Local-* "$OUT/SHA256SUMS.txt"
cp "$B/appimage/Lyft Local_${VER}_amd64.AppImage" "$OUT/${NAME}-Linux-Portable.AppImage"
chmod +x "$OUT/${NAME}-Linux-Portable.AppImage"
cp "$B/deb/Lyft Local_${VER}_amd64.deb" "$OUT/${NAME}-Linux-Setup.deb"
cp "$ROOT/scripts/friends-README.txt" "$OUT/README.txt"
cp "$ROOT/scripts/friends-setup.sh" "$OUT/setup.sh"
chmod +x "$OUT/setup.sh"

( cd "$OUT" && sha256sum Lyft-Local-* > SHA256SUMS.txt )

# One zip containing everything, for sending to friends.
ZIPDIR="$(mktemp -d)"
mkdir -p "$ZIPDIR/$NAME-Linux"
cp "$OUT"/{README.txt,setup.sh,SHA256SUMS.txt} "$OUT/${NAME}-Linux-Portable.AppImage" "$OUT/${NAME}-Linux-Setup.deb" "$ZIPDIR/$NAME-Linux/"
( cd "$ZIPDIR" && python3 -c "
import os, sys, zipfile
root = sys.argv[1]
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, _, files in os.walk(root):
        for f in files:
            full = os.path.join(dp, f)
            info = zipfile.ZipInfo.from_file(full, os.path.relpath(full, '.'))
            with open(full, 'rb') as fh:
                z.writestr(info, fh.read(), zipfile.ZIP_DEFLATED)
" "$NAME-Linux" "$OUT/${NAME}-Linux.zip" )
rm -rf "$ZIPDIR"

cp "$OUT/${NAME}-Linux.zip" "$OUT/${NAME}-Linux-Portable.AppImage" "$OUT/${NAME}-Linux-Setup.deb" "$DL/"
cp "$OUT/README.txt" "$DL/Lyft-Local-README.txt"

echo
echo "==> Downloads ready in $OUT (also served from /downloads)"
ls -lh "$OUT"
