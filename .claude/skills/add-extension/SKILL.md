---
name: add-extension
description: Vet and vendor a GNOME Shell extension into this repo (alternatives search, upstream issue/fork research, tracking file). Use when the user wants to add or fix an extension, given an extensions.gnome.org URL.
---
Follow the "Before adding an extension" and "On every change" sections of AGENTS.md for the EGO URL in $ARGUMENTS:
1. Fetch EGO info (`extension-info/?pk=<pk>`) → uuid, source repo, supported shells.
2. Search for supported alternatives (EGO query for shell 50 and 51) and recent forks; report a comparison table and ask the user to validate before porting.
3. Scan upstream issues/PRs/forks for shell 50/51 progress; pick the best fork to base on.
4. Vendor pristine commit, then fixes; write `tracking/<uuid>.md`; add to `scripts/check-upstream.sh`.
5. Build, install, and report what was tested vs untested.
