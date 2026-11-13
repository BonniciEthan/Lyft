#!/usr/bin/env bash
# Lyft Local: one-click setup without root.
# Copies the portable AppImage to ~/Applications and adds Lyft to the app menu.
#   Run:  bash setup.sh            (install)
#         bash setup.sh --remove   (uninstall; your workout data is kept)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Applications"
BIN="$DEST/LyftLocal.AppImage"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
DESKTOP="$HOME/.local/share/applications/lyft-local.desktop"

if [[ "${1:-}" == "--remove" ]]; then
  rm -f "$BIN" "$DESKTOP" "$ICON_DIR/lyft-local.png"
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
  echo "Lyft removed. Your data is still in ~/.local/share/com.personal.lyft.local/"
  exit 0
fi

SRC="$(ls "$HERE"/Lyft-Local-*-Linux-Portable.AppImage 2>/dev/null | head -n1 || true)"
if [[ -z "$SRC" ]]; then
  echo "Can't find the Lyft-Local-…-Linux-Portable.AppImage next to this script."
  exit 1
fi

mkdir -p "$DEST" "$ICON_DIR" "$(dirname "$DESKTOP")"
cp "$SRC" "$BIN"
chmod +x "$BIN"

# Pull the icon out of the AppImage so the menu entry has it.
TMP="$(mktemp -d)"
( cd "$TMP" && "$BIN" --appimage-extract '*.png' >/dev/null 2>&1 || true )
PNG="$(find "$TMP/squashfs-root" -maxdepth 1 -name '*.png' 2>/dev/null | head -n1 || true)"
[[ -n "$PNG" ]] && cp -L "$PNG" "$ICON_DIR/lyft-local.png"
rm -rf "$TMP"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Lyft
Comment=Minimal personal gym tracker
Exec="$BIN"
Icon=lyft-local
Terminal=false
Categories=Utility;
StartupWMClass=lyft-local
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true

# AppImages need FUSE 2 on Ubuntu 22.04+ / Zorin 17.
if ! ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then
  echo
  echo "NOTE: your system is missing FUSE 2, which AppImages need. Install it once with:"
  echo "  sudo apt install libfuse2      (Ubuntu 24.04 / newer: sudo apt install libfuse2t64)"
  echo "Or use the .deb instead:  sudo apt install ./$(basename "$(ls "$HERE"/*-Linux-Setup.deb | head -n1)")"
fi

echo
echo "Done! Open \"Lyft\" from your app menu."
