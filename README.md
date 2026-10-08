<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="MarkpadX Icon" />
  <h1>MarkpadX</h1>
  <p><b>A personal fork of <a href="https://github.com/alecdotdev/Markpad">Markpad</a> with additional features.</b></p>
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
- **The reading position is kept** on reload (`F5` and auto-reload): the element at the top of the view is re-pinned to the same spot, pixel-exact, while mermaid/KaTeX/highlighting re-render. Falls back to the source line if the element moved due to an external edit. Any scroll, click or key press releases the pin
- Reloads render the full document in one pass (no truncated first pass that shrinks the page and clamps the scroll position)
- The file watcher always follows the **active tab**, including restored sessions and tab switches, so auto-reload works right away without a first `F5`. When it switches to a file, changes made in the meantime are picked up
- Bursts of watcher events from a single save are coalesced into one reload; an older read can never overwrite a newer one, and unchanged content is not re-rendered
- The watcher is re-armed after every reload, so editors that save via temp file + rename keep triggering reloads

### Tab Navigation
- `←` / `→` (preview mode) switch to the previous / next tab
- Mouse buttons 4 / 5 (back / forward) walk the most-recently-used tab history — clicking a markdown link opens a new tab, mouse-back returns to the originating tab

### Selection Carry-over (Edit ↔ View)
- Text selected in the rendered preview stays selected in the editor when switching to edit mode, and vice versa
- The selection (or caret row) lands at the **same height on screen** as before the switch, instead of jumping
- A plain caret (no selection) is carried too: its row is located in the preview and marked with a temporary highlight (cleared on the next click or key press) without changing the real selection
- Without a visible selection in the preview, the editor opens on the row that was at the top of the preview
- Blank or syntax-only lines are positioned by interpolating inside their block (or the closest block above)
- Works inside table cells and inline formatting — markdown syntax (`*`, `_`, `` ` ``, `~`, `|` …) and whitespace differences are ignored when matching
- Not active in split view (both panes are already visible)

### Navigation Pane (Table of Contents)
- Clicking a heading reliably jumps to it on the **first click** — the view jumps instantly to the target and highlights it, then re-pins if the content reflows while rendering (mermaid, KaTeX, syntax highlighting and images change heights after load)
- Rapid clicks don't fight each other — a newer click supersedes any in-flight jump
- The pane refreshes **automatically** whenever the document content changes (tab switch, edit, reload), one frame after the new content is in the DOM, so no `F5` is needed to see an up-to-date outline

### Keyboard Shortcuts Dialog
- Press `?` (or `Shift+/`) in preview mode to open a grouped reference of every keyboard shortcut (File / View / Find / Zoom / Tabs)
- OS-aware: shows `⌘` on macOS, `Ctrl` on Windows / Linux
- `Esc` or click outside to dismiss

### Open-with from Explorer
- Robust Windows file-association handling: double-clicking an `.md` file while MarkpadX is already running brings the existing window into focus and opens the file (in an existing tab if one already shows that file, otherwise a new tab) — implemented via single-instance forwarding with a global broadcast event so the running instance always receives the path

### Other tweaks
- Build date shown in Settings → About so you can verify which build is running

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
- Run `npm run tauri build` to build the executable
- [Optional] Rename to `MarkpadInstaller.exe` to run as installer

## Contributing

Contributions are welcome! Markpad is built with SvelteKit and Tauri.

1. **Fork & Clone** the repository
2. **Install dependencies**: `npm install`
3. **Run the dev server**: `npm run tauri dev`
4. **Make your changes** and ensure type checking passes: `npm run check`
5. **Open a Pull Request**!

Please ensure your code follows the existing style and that you add descriptions for any new features.
