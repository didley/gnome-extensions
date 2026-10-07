# GNOME extensions monorepo

Vendored, patched GNOME Shell extensions that are unmaintained or lag behind GNOME. Targets: **current shell (50) and 51**.

## Layout
- `own/<name>/` — extensions I wrote from scratch (e.g. `sticky-notes`).
- `patched/<name>/` — vendored third-party extensions with my fixes. History: pristine upstream commit first, fixes on top (`git log -p` = the patch). Never put original code here, and never put forks in `own/`.
- `tracking/<uuid>.md` — upstream URL, EGO pk, pinned commit, applied fixes, alternatives, status (`forked|upstream-fixed|replaced`), last-checked date.
- `scripts/check-upstream.sh` — upstream/EGO status per tracked extension (add new ones to its `TRACKED` array).
- `scripts/build.sh <name>` (zip for self-contained extensions), `scripts/build-media-controls.sh`, `scripts/install.sh <uuid> <zip>`.
- `scripts/dev.sh <name>` — hot-reload an extension into the running session (no logout after the first run); `scripts/test.sh` — unit tests.
- `own/sticky-notes` is original code (not a fork); keep pure logic in dependency-free modules and add Node tests in `tests/` for it.

## Before adding an extension (always do all of these)
1. Search EGO (`https://extensions.gnome.org/extension-query/?search=<q>&shell_version=<50|51>`) and GitHub for maintained alternatives/forks supporting the current shell. Present candidates to the user to validate; don't silently replace.
2. Read upstream issues/PRs/forks (`gh issue list/search`, `gh api repos/<r>/forks`) for shell-version progress; reuse existing fork patches instead of rewriting.
3. Vendor pristine upstream into `patched/<name>` in its own commit, then fixes in separate commits. (Anything written from scratch goes in `own/` instead.)
4. Create `tracking/<uuid>.md` and add the extension to `scripts/check-upstream.sh`.

## On every change in this repo
Run `scripts/check-upstream.sh`. If upstream/EGO now supports 50+51, propose dropping the fork: uninstall local copy, install original from EGO, set tracking status `upstream-fixed`.

## Rules
- Only list a shell version in `metadata.json` that has been tested; mark untested ones in the tracking file. GNOME gives no forward-compat guarantee — re-check on each new release.
- Use ESM (`import ... from 'resource:///org/gnome/shell/...'`, `Extension` class). Avoid removed APIs: `add_actor`/`remove_actor` (use `add_child`), St `vertical:` (use `orientation: Clutter.Orientation.VERTICAL`).
- Host is immutable Fedora: `glib-compile-resources` may be missing; no `mutter-devkit`. Use toolbox/distrobox for build tools; test with `journalctl -f /usr/bin/gnome-shell` after a re-login (Wayland can't restart the shell).
- GNOME 50 gotchas: `PanelMenu.Button` swallows presses → use `captured-event`; `event.get_source()` can be null → `global.stage.get_event_actor(event)`; `Meta.Cursor` / `display.set_cursor` are gone → `actor.set_cursor_type(Clutter.CursorType.X)`; `addChrome` rejects `affectsInputRegion`; an empty `PopupMenu` never opens (fill it before `toggle()`); `Clutter.Text` paints its selection only with key focus; `Clutter.Color` is now `Cogl.Color` (`init_from_4f`).
- Wayland can't reload a new extension folder or cached module in-session: use `scripts/dev.sh` (loader + `?v=N` imports), not repeated logouts.
