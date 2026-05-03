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
- Navigate results with `Enter` / `Shift+Enter` or arrow buttons
- Search-as-you-type from 3+ characters for performance on large documents
- Case-sensitive toggle

### Preview Link Navigation
Clickable links in the rendered preview — all paths are resolved relative to the current file:
- **Anchor links** (`[Section](#section)`) — smoothly scrolls to the target heading within the document
- **Markdown file links** (`[Notes](notes.md)`) — opens the linked `.md` file in a new tab; if the file is already open in another tab, that tab is focused and refreshed from disk instead of duplicating it (path comparison normalizes slashes and case)
- **Folder links** (`[Docs](docs/)`) — opens the folder in Windows Explorer
- **HTTP links** — open in the default browser
- Hovering any link shows a tooltip with the resolved target path

### Refresh & Live Reload
- `Ctrl+R` / `F5` to reload the current file from disk in preview mode
- Live Mode enabled by default — auto-reloads when the file changes on disk
- Live Mode setting persisted across sessions

### Tab Navigation
- `←` / `→` (preview mode) switch to the previous / next tab
- Mouse buttons 4 / 5 (back / forward) walk the most-recently-used tab history — clicking a markdown link opens a new tab, mouse-back returns to the originating tab

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
