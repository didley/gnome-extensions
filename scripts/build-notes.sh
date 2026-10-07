#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../extensions/notes/notes@maestroschan.fr"
mkdir -p ../dist
gnome-extensions pack -f -o ../dist \
  --schema=schemas/org.gnome.shell.extensions.notes-extension.gschema.xml \
  --extra-source=dialog.js --extra-source=menus.js --extra-source=noteBox.js .
echo "built: $(realpath ../dist)/notes@maestroschan.fr.shell-extension.zip"
