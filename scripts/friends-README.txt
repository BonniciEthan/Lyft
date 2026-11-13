LYFT: minimal personal workout log
=========================================

Everything you log stays on your own computer. Nothing is uploaded and you don't
need an account. The app starts empty, so add your own split, exercises and goals.

Tabs:
  My Split   choose Push / Pull / Legs / Rest for each day, then add your exercises
  Progress   today's workout; log weight, reps and whether a set was spotted.
             Swipe or use < > to flip back through past days.
  Goals      PR targets with a progress bar


LINUX (Ubuntu, Zorin, Mint, Debian …)
-------------------------------------
Option 1: Install with the .deb (recommended)
  Double-click  Lyft-Local-…-Linux-Setup.deb  and click Install,
  or in a terminal:
    sudo apt install ./Lyft-Local-*-Linux-Setup.deb
  Then open "Lyft Local" from your app menu.
  Uninstall: sudo apt remove lyft-local

Option 2: Portable AppImage (no install)
  1. Right-click  Lyft-Local-…-Linux-Portable.AppImage → Properties →
     Permissions → tick "Allow executing file as program"
     (or: chmod +x Lyft-Local-*.AppImage)
  2. Double-click it.
  If nothing happens, install FUSE 2 once:  sudo apt install libfuse2
  (on Ubuntu 24.04 or newer:  sudo apt install libfuse2t64)

Option 3: Setup script (AppImage plus an app-menu shortcut, no sudo)
  Open a terminal in this folder and run:   bash setup.sh
  Remove it again with:                     bash setup.sh --remove


YOUR DATA
---------
Your data is saved automatically on every tap, in:
  ~/.local/share/com.personal.lyft.local/
Uninstalling the app does not delete your data.
