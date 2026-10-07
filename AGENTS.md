# GNOME extensions monorepo

Vendored, patched GNOME Shell extensions that are unmaintained or lag behind GNOME. Targets: **current shell (50) and 51**.

## Layout
- `extensions/<name>/` — source. History: pristine upstream commit first, fixes on top (`git log -p` = the patch).
- `tracking/<uuid>.md` — upstream URL, EGO pk, pinned commit, applied fixes, alternatives, status (`forked|upstream-fixed|replaced`), last-checked date.
- `scripts/check-upstream.sh` — upstream/EGO status per tracked extension (add new ones to its `TRACKED` array).
- `scripts/build-media-controls.sh`, `scripts/install.sh <uuid> <zip>`.

## Before adding an extension (always do all of these)
1. Search EGO (`https://extensions.gnome.org/extension-query/?search=<q>&shell_version=<50|51>`) and GitHub for maintained alternatives/forks supporting the current shell. Present candidates to the user to validate; don't silently replace.
2. Read upstream issues/PRs/forks (`gh issue list/search`, `gh api repos/<r>/forks`) for shell-version progress; reuse existing fork patches instead of rewriting.
3. Vendor pristine upstream in its own commit, then fixes in separate commits.
4. Create `tracking/<uuid>.md` and add the extension to `scripts/check-upstream.sh`.

## On every change in this repo
Run `scripts/check-upstream.sh`. If upstream/EGO now supports 50+51, propose dropping the fork: uninstall local copy, install original from EGO, set tracking status `upstream-fixed`.

## Rules
- Only list a shell version in `metadata.json` that has been tested; mark untested ones in the tracking file. GNOME gives no forward-compat guarantee — re-check on each new release.
- Use ESM (`import ... from 'resource:///org/gnome/shell/...'`, `Extension` class). Avoid removed APIs: `add_actor`/`remove_actor` (use `add_child`), St `vertical:` (use `orientation: Clutter.Orientation.VERTICAL`).
- Host is immutable Fedora: `glib-compile-resources` may be missing; no `mutter-devkit`. Use toolbox/distrobox for build tools; test with `journalctl -f /usr/bin/gnome-shell` after a re-login (Wayland can't restart the shell).
