<div align="center">
  <img src="src-tauri/icons/128x128.png" width="128" alt="MarkpadX Icon" />
  <h1>MarkpadX</h1>
  <p><b>Based on <a href="https://github.com/alecdotdev/Markpad">Markpad</a> — The Notepad equivalent for Markdown</b></p>

  [![GitHub Release](https://img.shields.io/github/v/release/alecdotdev/Markpad?style=flat-square)](https://github.com/alecdotdev/Markpad/releases/latest)

  <p>A lightweight, minimalist Markdown viewer and text editor built for productivity across Windows, macOS, and Linux.</p>

  <a href="https://markpad.sftwr.dev">Website</a> // <a href="https://github.com/alecdotdev/Markpad/releases/latest">Download Latest Release</a> // <a href="https://github.com/alecdotdev/Markpad/issues">Report a Bug</a>
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

## Installation

### Package Managers

#### Windows (Chocolatey)

```powershell
choco install markpad-app --version=2.5.0 # version flag is temporary for now
```

#### Linux (Snap)

```bash
sudo snap install markpad 
```

### Direct Download

Download the latest executable or installer from the [releases page](https://github.com/alecdotdev/Markpad/releases/latest) or from [markpad.sftwr.dev](https://markpad.sftwr.dev)

## Installation from source

- Clone the repository
- Run `npm install` to install dependencies
- Run `npm run tauri build` to build the executable 
- [Optional] Rename to `MarkpadInstaller.exe` to run as installer

## Issues & Feedback

If you find a bug, have a feature request, or just want to leave some feedback, please [open an issue](https://github.com/alecdotdev/Markpad/issues/new/choose). I'm actively developing Markpad and love hearing from users!

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
