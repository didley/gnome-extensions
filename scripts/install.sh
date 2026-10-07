#!/usr/bin/env bash
# Usage: install.sh <uuid> <zip>   — install a built zip and enable it (takes effect after shell reload/relogin on Wayland).
set -euo pipefail
gnome-extensions install --force "$2"
gnome-extensions enable "$1" || true
gnome-extensions info "$1" | grep -E 'State|Enabled'
