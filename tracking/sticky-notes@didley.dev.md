# Sticky Notes (sticky-notes@didley.dev)
- Original code in this repo (no upstream). Replaces `notes@maestroschan.fr`.
- Status: `own`
- Target shells: 50, 51
  - **50**: run and used daily on 50.5.
  - **51**: listed on request, **not run** (no 51 environment here). Basis: static review against the GNOME Shell 51 porting guide (https://gjs.guide/extensions/upgrading/gnome-shell-51.html) — none of the removed/changed APIs are used (`vertical`, `St.ButtonMask`, `PopupMenu.open/close` signature, async `disable()`, `Clutter.get_default_backend`, `makeProxyWrapper`, `pointerWatcher`).
  - Known 51 risk: direct event signals (`captured-event`) are deprecated in 51 and slated for removal; migrate to Clutter controllers (`ClickGesture`, `KeyController`, ...) when they go.
- Licence: GPL-3.0-or-later
- Last checked: 2026-10-08
