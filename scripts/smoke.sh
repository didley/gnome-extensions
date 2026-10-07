#!/usr/bin/env bash
# Smoke test in the LIVE session: hot-reload the extension, then fail if the
# shell logged any error from it. Catches most breakages that unit tests can't.
# Usage: scripts/smoke.sh sticky-notes
set -uo pipefail
name="${1:?usage: smoke.sh <extension-name>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
uuid=$(python3 - "$root" "$name" <<'P'
import json, os, sys
root, name = sys.argv[1:]
for d in ("own", "patched"):
    p = os.path.join(root, d, name, "metadata.json")
    if not os.path.exists(p): p = os.path.join(root, d, name, "src", "metadata.json")
    if os.path.exists(p): print(json.load(open(p))["uuid"]); break
P
)
[ -n "$uuid" ] || { echo "unknown extension: $name" >&2; exit 2; }

start=$(date '+%Y-%m-%d %H:%M:%S')
if ! reload_out=$("$root/scripts/dev.sh" "$name" 2>&1); then
  echo "SMOKE FAILED: could not hot-reload $uuid"
  printf '%s\n' "$reload_out"
  exit 1
fi
sleep 3

state=$(gnome-extensions info "$uuid" 2>/dev/null | awk '/State:/ {print $2}')
log=$(journalctl -b _COMM=gnome-shell --since "$start" --no-pager 2>/dev/null)

# A "JS ERROR" block = that line plus its indented stack lines. Keep blocks that mention this extension.
errors=$(printf '%s\n' "$log" | python3 -c '
import re, sys
uuid, name = sys.argv[1], sys.argv[2]
blocks, cur = [], None
for line in sys.stdin:
    if re.search(r"JS ERROR|\[Sticky Notes\]|\[dev-loader\]|CRITICAL", line):
        cur = [line.rstrip()]; blocks.append(cur)
    elif cur is not None and line.startswith(" "):
        cur.append(line.rstrip())
    else:
        cur = None
bad = ["\n".join(b) for b in blocks if uuid in "\n".join(b) or "[Sticky Notes]" in b[0] or "[dev-loader]" in b[0]]
print("\n\n".join(bad))
' "$uuid" "$name")

if [ "$state" != "ACTIVE" ] || [ -n "$errors" ]; then
  echo "SMOKE FAILED: $uuid state=$state"
  [ -n "$errors" ] && printf '%s\n' "$errors"
  exit 1
fi
echo "smoke ok: $uuid is ACTIVE with no errors logged since reload"
