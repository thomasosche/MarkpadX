<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="MarkpadX Icon" />
  <h1>MarkpadX</h1>
  <p><b>A personal fork of <a href="https://github.com/sftwrdotdev/Markpad">Markpad</a> with additional features.</b></p>
  <p>This is not an official release — it is intended to be built from source only.</p>
</div>

<br />

## New in MarkpadX (vs. upstream)

### Preview Search
- `Ctrl+F` / `F3` to search within the rendered preview with highlighted matches
- Pressing `Ctrl+F` again while the search bar is open clears the previous search and starts a fresh one
- Navigate results with `Enter` / `Shift+Enter` or arrow buttons
- Search-as-you-type from 3+ characters for performance on large documents
- Case-sensitive toggle

### Preview Link Navigation
Clickable links in the rendered preview — all paths are resolved relative to the current file:
- **Anchor links** (`[Section](#section)`) — smoothly scrolls to the target heading within the document
- **Markdown file links** (`[Notes](notes.md)`) — opens the linked `.md` file in a new tab; if the file is already open in another tab, that tab is focused and refreshed from disk instead of duplicating it (path comparison normalizes slashes and case)
- **Folder links** (`[Docs](docs/)`) — opens the folder in Windows Explorer
- **File links** (`[Report](path/to/report.pdf)`) — opens the file with the system's default application (e.g. PDFs in your PDF viewer, images in your image viewer)
- **HTTP links** — open in the default browser
- Hovering any link shows a tooltip with the resolved target path

### Refresh & Live Reload
- `Ctrl+R` / `F5` to reload the current file from disk in preview mode
- Live Mode enabled by default: auto-reloads when the file changes on disk
- Live Mode setting persisted across sessions
- **The reading position is kept** on reload (`F5` and auto-reload): the element at the top of the view is re-pinned to the same spot, pixel-exact, while mermaid/KaTeX/highlighting re-render. Any scroll, click or key press releases the pin
- External edits are followed line by line (a line diff of the old and new file): lines inserted or deleted above keep the viewed content in place, a selection in the preview survives, and if the viewed lines themselves were deleted the nearest remaining line above moves to the top. Works at every zoom level
- In edit mode the caret, the selection and the viewed lines stay on the same text after an external change (a changed line keeps the caret; a deleted one moves it to the line above). Unsaved edits are never replaced: a notice tells you the file changed on disk, and `Ctrl+S` saves your version
- Reloads render the full document in one pass (no truncated first pass that shrinks the page and clamps the scroll position)
- The file watcher always follows the **active tab**, including restored sessions and tab switches, so auto-reload works right away without a first `F5`. When it switches to a file, changes made in the meantime are picked up
- Bursts of watcher events from a single save are coalesced into one reload; an older read can never overwrite a newer one, and unchanged content is not re-rendered
- The watcher is re-armed after every reload, so editors that save via temp file + rename keep triggering reloads

### Tab Navigation
- `←` / `→` (preview mode) switch to the previous / next tab
- Mouse buttons 4 / 5 (back / forward) walk the most-recently-used tab history — clicking a markdown link opens a new tab, mouse-back returns to the originating tab
- `Ctrl+Shift+W` closes all other tabs (asks for each tab with unsaved changes)
- Tabs with unsaved changes show a dot in front of the tab name

### Task Lists in Preview
- Task checkboxes (`- [ ]` / `- [x]`) can be toggled directly in preview mode, no edit mode needed
- A toggle is kept in memory and marks the tab as unsaved; save with `Ctrl+S` or File → Save. Toggling back to the saved state clears the mark
- Each checkbox is mapped to its exact source line (bullet and numbered lists, nested and blockquoted items); checkboxes in code blocks are never touched
- If a checkbox cannot be matched safely, or the file changed on disk since it was rendered, nothing is changed and a notice is shown
- Unsaved toggles survive tab switches and are shown in the editor when switching to edit mode; live reload never overwrites them (`F5` asks first)
- Keyboard: `Space` or `Enter` on a focused checkbox toggles it

### Selection Carry-over (Edit ↔ View)
- Text selected in the rendered preview stays selected in the editor when switching to edit mode, and vice versa
- The selection (or caret row) lands at the **same height on screen** as before the switch, instead of jumping
- A plain caret (no selection) is carried too: its row is located in the preview and briefly glows (about one second, then fades out completely) without changing the real selection
- Works at every zoom level; in the editor the caret line is framed by a clearly visible border (built-in light and dark themes)
- Without a visible selection in the preview, the editor opens on the row that was at the top of the preview
- Blank or syntax-only lines are positioned by interpolating inside their block (or the closest block above)
- Works inside table cells and inline formatting — markdown syntax (`*`, `_`, `` ` ``, `~`, `|` …) and whitespace differences are ignored when matching
- Not active in split view (both panes are already visible)

### Navigation Pane (Table of Contents)
- Clicking a heading reliably jumps to it on the **first click** — the view jumps instantly to the target and highlights it, then re-pins if the content reflows while rendering (mermaid, KaTeX, syntax highlighting and images change heights after load)
- Rapid clicks don't fight each other — a newer click supersedes any in-flight jump
- The pane refreshes **automatically** whenever the document content changes (tab switch, edit, reload), one frame after the new content is in the DOM, so no `F5` is needed to see an up-to-date outline
- The outline is **always docked** beside the text (no undock option) and never covers it; the **switch side** button in its header moves it, and the folder pane, to the other side

### Folder pane
- A second side pane, on the **opposite side from the outline**, lists the Markdown (`.md`) files of a folder — flat, one level, sorted by name with numbers in natural order (`2.md` before `10.md`)
- By default it shows the folder of the **active tab** and follows tab switches; the **pin** button in the pane header keeps the current folder while you open files elsewhere
- **⋮ → Open Folder…** picks a folder with the system dialog, pins it and opens the pane
- Click a file to open it; a file that is already open switches to its tab. The active file is highlighted, files open in a tab are marked, and unsaved files show the same dot as their tab
- The list refreshes on tab switch, pin/unpin, when the window regains focus, after Save / Save As into the shown folder, and with the refresh button
- The **switch side** button in the pane header swaps folder pane and outline (same as the outline's own switch-side button)
- Toggle it with the floating folder button or in **Settings → Appearance → Show Folder Pane**; like the outline it is always docked beside the text (never covers it), works in view, edit and split mode, and is hidden on the Recents page and in Zen mode
- Only whether the pane is open is remembered; a pinned folder is not restored after a restart. Hidden entries, subfolders, symlinks and junctions are never listed

### Keyboard Shortcuts Dialog
- Press `?` (or `Shift+/`) in preview mode to open a grouped reference of every keyboard shortcut (File / View / Find / Zoom / Tabs)
- OS-aware: shows `⌘` on macOS, `Ctrl` on Windows / Linux
- `Esc` or click outside to dismiss

### Open-with from Explorer
- Robust Windows file-association handling: double-clicking an `.md` file while MarkpadX is already running brings the existing window into focus and opens the file (in an existing tab if one already shows that file, otherwise a new tab) — implemented via single-instance forwarding with a global broadcast event so the running instance always receives the path

### Other tweaks
- Build date shown in Settings → About so you can verify which build is running
- Settings → Appearance: **Show Folder Pane** (off by default) next to the Table of Contents option

<br />

## Features (shared with upstream Markpad)

### Editor
- Monaco editor (VS Code engine)
- Syntax highlighting in editor and code blocks
- Vim mode
- Tabbed interface
- Split view (side-by-side edit + preview)
- Zen mode

### Preview
- Familiar GitHub-styled markdown rendering
- Math equation support (KaTeX)
- Mermaid diagram support
- Image and YouTube embeds
- Custom typography and font settings
- Content zooming
- Table of contents
- Custom themes
- Paste images into editor
- PDF and HTML export

### General
- Auto-reload on file changes
- Cross-platform (Windows, macOS, Linux)
- Lightweight native UI
- Tiny memory usage (~10MB)
- No telemetry or bloat
- Free and open-source

## Installation from source

- Clone the repository
- Run `npm install` to install dependencies
- Run `npm run build` and then `npx tauri build --no-bundle` to build only the executable (`src-tauri/target/release/Markpad.exe`); this is the intended way to use MarkpadX
- `npm run tauri build` (or `release.ps1`) additionally produces the MSI/NSIS installers; the exe can be renamed to `MarkpadInstaller.exe` to run as installer
- `build.ps1` makes a debug build and closes running Markpad instances first

## Ideas and planned work

Ideas that are not scheduled yet live in [`IDEAS.md`](IDEAS.md), one entry per idea with what it should do, why, notes on how it could be built and the open questions. It also holds the plan for re-basing MarkpadX on the current upstream release, including the list of fork features that need to be carried over afterwards.

## Contributing

Contributions are welcome! Markpad is built with SvelteKit and Tauri.

1. **Fork & Clone** the repository
2. **Install dependencies**: `npm install`
3. **Run the dev server**: `npm run tauri dev`
4. **Make your changes** and ensure type checking passes: `npm run check`
5. **Run the unit tests**: `npm test` (Node's built-in test runner, `tests/*.test.mjs`)
6. **Run the end-to-end tests** (Windows): build the debug exe with `npx tauri build --debug --no-bundle`, close any running Markpad (single instance), then `npm run test:e2e` — or `npm run test:e2e -- folder` for one suite. The suites drive the real app over WebView2's DevTools protocol with a throw-away profile and their own fixture files; see `tests/e2e/README.md`
7. **Open a Pull Request**!

Please ensure your code follows the existing style and that you add descriptions for any new features.

Upstream: this fork tracks [sftwrdotdev/Markpad](https://github.com/sftwrdotdev/Markpad) (git remote `upstream`). The last merged upstream version is 2.6.5; see `IDEAS.md` I-03 for the state of the sync.
