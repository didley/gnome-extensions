# Notes (notes@maestroschan.fr)
- EGO: https://extensions.gnome.org/extension/1357/notes/ (pk 1357) — shells 40–42 only
- Upstream: https://github.com/maoschanz/notes-extension-gnome — last push 2024-03; issues #99/#104/#105 ask for 45/46/47+ support
- Pinned base: fork magentowizard1/notes-extension-gnome 68a5a29 ("Updated to support Gnome 49", ESM port, same uuid/schema so notes carry over)
- Local changes: `vertical:true`→`orientation`, `add_actor`→`add_child`, metadata 49/50/51
- Status: `forked` — **51 untested**
- Alternatives (USER TO VALIDATE):
  | Option | Shells | Notes |
  |---|---|---|
  | pelach/notes-extension-gnome (`notes@pch76`) | 48–50, pushed 2026-08 | Active fork, different uuid+schema (no data migration), not on EGO |
  | Notes With History (EGO 7847, grizzlysmit) | 49–51 on EGO | Panel menu of notes, not desktop sticky notes; last push 2025-10 |
  | NoteDock (EGO 10548) | 50 | Top-panel scratchpad; tiny user base |
- Drop fork when: EGO listing of a maintained alternative covers 50+51 and you accept its feature set.
- Last checked: 2026-10-07
