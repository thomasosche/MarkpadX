# End-to-end tests

Real-app tests: they start the **debug build** (`src-tauri/target/debug/Markpad.exe`) and drive it over
WebView2's DevTools protocol (real mouse and key events, no app hooks). Windows only, Node 24
(global `WebSocket` / `fetch`).

## Prerequisites

1. Build the debug exe (no installer):
   ```
   npx tauri build --debug --no-bundle
   ```
   Rebuild after every frontend or Rust change; the tests run against the exe, not against `vite dev`.
2. **Close every running Markpad first.** The app allows a single instance: a second launch would hand
   its file argument to the running one and the tests would drive (or modify) your real session.
   The runner and the harness refuse to start while `Markpad.exe` is running.
3. Do not touch the machine's mouse/keyboard focus-sensitive windows while a suite runs; the events are
   sent over CDP, but the window must stay open.

## Run

```
npm run test:e2e                 # all suites, one after another
node tests/e2e/run.mjs folder    # selected suites: main carry reload folder tabsearch
node tests/e2e/folder.mjs        # a single suite directly
```

`run.mjs` runs the suites strictly sequentially, prints a summary and exits non-zero if any suite failed.

| Suite | CDP port | What it covers |
|---|---|---|
| `main.mjs` | 9333 | task checkboxes, save, live reload, unsaved dialogs, tabs |
| `carry.mjs` | 9335 | selection / caret carry-over between view and edit mode at several zoom levels |
| `reload.mjs` | 9336 | auto reload after external changes (observation: records positions, asserts a few invariants) |
| `folder.mjs` | 9337 | folder pane (I-05), 11 checks, see below |
| `tabsearch.mjs` | 9338 | per-tab preview search (Ctrl+F): query, current match, highlights and reading position survive tab switches; F3 / Esc per tab |

## Isolation and safety

- Each suite uses its own throw-away WebView2 profile (`WEBVIEW2_USER_DATA_FOLDER`) and fixture folder under
  `%TEMP%\markpadx-e2e\<suite>\` (`fixture\`, `profile\`, `logs\`). They are deleted at the start of the suite.
  Your real Markpad profile and session are never used.
- **SAFETY STOP:** the suite aborts when an open tab, a dialog text or a listed path refers to a file that is not
  inside its fixture folder.
- App stdout/stderr and result JSON files are written to `logs\`.
- Closing the app uses `taskkill /T /F`. WebView2 flushes `localStorage` lazily, so the restart check in
  `folder.mjs` waits 6 s after writing a setting before it kills the app.

## folder.mjs: contract and checks

Uses only the documented DOM contract: `.folder-toggle-floating`, `.folder-pane-wrapper` (`on-left` / `on-right` /
`is-pinned`), `.folder-pane`, `.folder-pane-title[title]`, `.folder-pane-pin[aria-pressed]`, `.folder-pane-refresh`,
`.folder-pane-switch-side`, `ul.folder-pane-list > li.folder-pane-item[data-path]` (`active` / `open` / `dirty`) with
`button.folder-pane-link`, `.folder-pane-empty`, `.folder-pane-error`, `button.home-menu-item[data-action="open-folder"]`,
`localStorage` keys `editor.showFolderPane`, `editor.tocSide`.

Fixture: `A/` with `a.md B.md 2.md 10.md notes.txt .hidden.md sub/c.md` and a junction `A/link` (created with
`mklink /J`) to `other/`, which holds `x.md`.

1. pane off by default; the toggle opens it opposite the outline; close works; the menu has "Open Folder"
2. the list is exactly `2.md, 10.md, a.md, B.md`
3. active file highlighted; click opens a tab; clicking an already open file reuses its tab
4. opening `other/x.md` (link in `a.md`) switches the list to `other/`
5. pin keeps the list across tab switches; unpin follows again
6. a new file appears only after a trigger (tab switch, refresh button)
7. Save refreshes the list; the dirty marker follows the tab
8. folder renamed while shown: error state, no crash; renamed back + refresh: list again
9. restart on the same profile: pane open, pin not restored; the other outline side moves the pane
   (the outline side is set through `localStorage` + restart, there is no UI hook in the contract)
10. docked pane (always docked, like the outline): no overlap with editor / preview text in view, edit (Ctrl+E) and split (Ctrl+H)
    mode; at zoom 200 (Ctrl+= x10) the list is still clickable
11. app still running, no console errors

## Manual checks (not automatable over CDP)

- The native folder picker behind "Open Folder..." (the suite only asserts that the menu entry exists).
- Refresh when the window regains focus.
- A folder on a network share.

## Isolated frontend navigation regression

Start `npm run dev -- --host 127.0.0.1 --port 4175`, then run
`node tests/e2e/browser-navigation.mjs` on Windows with Edge installed.
`MARKPAD_TEST_BROWSER` can override the Edge executable path.

This test uses real Svelte/Monaco in a fresh headless browser profile, synthetic
HTML-table documents and mock Tauri file/clipboard commands. It covers context-menu
Edit, repeated phrases, HTML formatting/entities, Ctrl+V and Paste in Find,
formatted-text fallback, literal Find, preview return, repeated switching and edit/save
position retention. It does not test native Rust rendering or the OS clipboard.
It never launches the user's Markpad instance or accesses real documents.

The manual `Navigation test executable (no release)` workflow builds a separate
Windows executable and runs the existing native carry/tabsearch suites. It publishes
only a temporary build artifact, never a release or installer.
