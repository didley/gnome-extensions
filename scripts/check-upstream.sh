#!/usr/bin/env bash
# Report upstream status for each tracked extension. Usage: check-upstream.sh [shell_version ...]  (default: 50 51)
# Add rows to TRACKED as "uuid|ego_pk|github_owner/repo".
set -uo pipefail
VERSIONS=("${@:-50 51}"); read -ra VERSIONS <<< "${VERSIONS[*]}"
TRACKED=(
  "mediacontrols@cliffniff.github.com|4470|sakithb/media-controls"
  "notes@maestroschan.fr|1357|maoschanz/notes-extension-gnome"
)
for row in "${TRACKED[@]}"; do
  IFS='|' read -r uuid pk repo <<< "$row"
  echo "== $uuid"
  gh api "repos/$repo" --jq '"  repo: archived=\(.archived) pushed=\(.pushed_at) open_issues=\(.open_issues_count)"' 2>&1
  for v in "${VERSIONS[@]}"; do
    curl -s "https://extensions.gnome.org/extension-info/?pk=$pk&shell_version=$v" | python3 -c "
import sys,json
try: m=json.load(sys.stdin).get('shell_version_map',{})
except Exception: m={}
print('  EGO shell $v:', 'SUPPORTED (v%s)'%m[\"$v\"]['version'] if \"$v\" in m else 'not published')"
  done
  echo "  issues mentioning versions:"
  gh issue list -R "$repo" --state all -S "49 OR 50 OR 51 OR GNOME" --limit 5 --json number,state,title --jq '.[]|"    #\(.number) \(.state) \(.title)"' 2>&1
done
