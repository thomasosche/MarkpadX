<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="MarkpadX Icon" />
  <h1>MarkpadX</h1>
  <p><b>A personal fork of <a href="https://github.com/alecdotdev/Markpad">Markpad</a> with additional features.</b></p>
  <p>This is not an official release — it is intended to be built from source only.</p>
</div>

<br />

## New in MarkpadX

### Preview Search
- Ctrl+F / F3 to search within the rendered preview with highlighted matches
- Navigate results with Enter / Shift+Enter or arrow buttons
- Search-as-you-type from 3+ characters for performance on large documents
- Case-sensitive toggle

### Refresh & Live Reload
- Ctrl+R / F5 to reload the current file from disk in preview mode
- Live Mode enabled by default — auto-reloads when the file changes on disk
- Live Mode setting persisted across sessions

<br />

![demo](pics/demo.gif)

## Features

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

Contributions are always welcome! Markpad is built with SvelteKit and Tauri. 

1. **Fork & Clone** the repository
2. **Install dependencies**: `npm install`
3. **Run the dev server**: `npm run tauri dev` (to run the Tauri app locally)
4. **Make your changes** and ensure type checking passes: `npm run check`
5. **Open a Pull Request**!

Please ensure your code follows the existing style and that you add descriptions for any new features.

## Screenshots

![split view](pics/splitview.png)
![home page](pics/home.png)
![split view minimal](pics/splitview-minimal.png)
![code block](pics/codeblock.png)
![light mode](pics/lightmode.png)
![settings](pics/settings.png)
![zen mode](pics/zenmode-view.png)
