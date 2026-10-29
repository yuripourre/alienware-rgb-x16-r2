#!/usr/bin/env bash
# Install the aw-lights CLI and the "Alienware Lights" GNOME Shell extension.
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"
uuid="alienware-lights@yuripourre.github.com"
build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT

install -Dm755 "$repo/aw-lights" "$HOME/.local/bin/aw-lights"

gnome-extensions pack "$repo/gnome-extension" \
    --extra-source="$repo/aw-lights" --force -o "$build"
gnome-extensions install --force "$build/$uuid.shell-extension.zip"

if gnome-extensions enable "$uuid" 2>/dev/null; then
    echo "Installed and enabled $uuid."
else
    echo "Installed $uuid. Log out and back in, then run:"
    echo "  gnome-extensions enable $uuid"
fi
