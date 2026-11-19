#!/bin/sh
# Install OmniReader for the current user (no sudo needed).
#   ./install.sh             install (builds from source if no prebuilt binary is found)
#   ./install.sh --uninstall remove the program (your books, notes and word book are kept)
set -e
cd "$(dirname "$0")"

BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

if [ "$1" = "--uninstall" ]; then
  rm -f "$BIN_DIR/omnireader" "$APP_DIR/omnireader.desktop" "$ICON_DIR/omnireader.png"
  update-desktop-database "$APP_DIR" 2>/dev/null || true
  echo "OmniReader has been uninstalled."
  echo "Your data is kept in ~/.local/share/omnireader and ~/.local/share/io.github.omnireader"
  exit 0
fi

BIN=""
for candidate in bin/omnireader src-tauri/target/release/omnireader; do
  if [ -x "$candidate" ]; then BIN="$candidate"; break; fi
done

if [ -z "$BIN" ]; then
  if ! command -v cargo >/dev/null 2>&1; then
    echo "Error: no prebuilt binary found and Rust (cargo) is not installed."
    echo "Install Rust from https://rustup.rs, or download a release build."
    exit 1
  fi
  echo "Building OmniReader from source (this takes a few minutes the first time)..."
  (cd src-tauri && cargo build --release)
  BIN=src-tauri/target/release/omnireader
fi

install -Dm755 "$BIN" "$BIN_DIR/omnireader"
install -Dm644 src-tauri/icons/icon.png "$ICON_DIR/omnireader.png"
install -Dm644 omnireader.desktop "$APP_DIR/omnireader.desktop"
update-desktop-database "$APP_DIR" 2>/dev/null || true

# remove an install of the app under its earlier name (Shiori); data is migrated on first launch
if [ -e "$BIN_DIR/shiori" ] || [ -e "$APP_DIR/shiori.desktop" ]; then
  rm -f "$BIN_DIR/shiori" "$APP_DIR/shiori.desktop" "$ICON_DIR/shiori.png"
  update-desktop-database "$APP_DIR" 2>/dev/null || true
  echo "Removed the old \"Shiori\" installation (your data will be carried over)."
fi

echo "Installation complete: $BIN_DIR/omnireader"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not in your PATH. Add it, or launch OmniReader from your app menu." ;;
esac
