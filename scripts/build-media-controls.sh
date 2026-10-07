#!/usr/bin/env bash
# Build media-controls zip (mirrors upstream package.json build, without pnpm).
set -euo pipefail
cd "$(dirname "$0")/../patched/media-controls"
rm -rf dist && mkdir -p dist/temp dist/builds
cp -r src/* dist/temp/
R=org.gnome.shell.extensions.mediacontrols.gresource
if command -v glib-compile-resources >/dev/null; then
  glib-compile-resources assets/$R.xml --target=dist/temp/$R --sourcedir=assets
else
  echo "warn: glib-compile-resources missing (immutable host?); reusing prebuilt $R (assets are unchanged from upstream)" >&2
  cp "$HOME/.local/share/gnome-shell/extensions/mediacontrols@cliffniff.github.com/$R" dist/temp/$R
fi
cd dist/temp
gnome-extensions pack -f -o ../builds/ \
  --schema='../../assets/org.gnome.shell.extensions.mediacontrols.gschema.xml' \
  --podir='../../assets/locale' --extra-source=helpers --extra-source=types \
  --extra-source=org.gnome.shell.extensions.mediacontrols.gresource --extra-source=utils .
echo "built: $(pwd)/../builds/mediacontrols@cliffniff.github.com.shell-extension.zip"
