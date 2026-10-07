#!/usr/bin/env bash
# Build an installable/uploadable zip for a self-contained extension dir.
# Usage: scripts/build.sh sticky-notes   ->  own/sticky-notes/dist/<uuid>.shell-extension.zip
set -euo pipefail
name="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"
src=""; for d in own patched; do [ -d "$root/$d/$name" ] && src="$root/$d/$name"; done
[ -n "$src" ] || { echo "no extension named $name in own/ or patched/" >&2; exit 1; }
cd "$src"
extra=()
for f in *.js; do [[ "$f" == extension.js || "$f" == prefs.js ]] || extra+=(--extra-source="$f"); done
for f in LICENSE icons; do [ -e "$f" ] && extra+=(--extra-source="$f"); done
schema=(); for s in schemas/*.gschema.xml; do [ -e "$s" ] && schema+=(--schema="$s"); done
mkdir -p dist
gnome-extensions pack -f -o dist "${schema[@]}" "${extra[@]}" .
uuid=$(python3 -c "import json;print(json.load(open('metadata.json'))['uuid'])")
echo "built: $src/dist/$uuid.shell-extension.zip"
unzip -l "dist/$uuid.shell-extension.zip" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
