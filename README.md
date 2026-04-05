# Trim

A Windows Spotlight-like launcher for quickly searching apps, asking AI questions, doing calculations, and browsing folders.

## Prerequisites

- **Windows 11**
- **Node.js LTS** — install via `winget install OpenJS.NodeJS.LTS` if not already installed

## Install

```bash
cd C:\Users\Yoshi\Documents\Trim
npm install
```

## Run

**From a regular terminal** (Command Prompt, PowerShell, Windows Terminal):
```bash
npm start
```

**From VS Code / Claude Code terminal** (where `ELECTRON_RUN_AS_NODE` is set):
```bash
start.bat
```

Both methods launch Trim in the background and return immediately.

## Usage

Press **Ctrl + Space** to toggle the launcher. Press **Escape** to hide it.

### Prefixes

| Prefix | Function | Example |
|--------|----------|---------|
| *(none)* | Search installed apps | `firefox` |
| `?` | Ask Gemini AI (with web search) | `? weather in tokyo` |
| `c:` | Calculator | `c: 2^10 + sqrt(144)` |
| `f:` | Browse folders/files | `f: C:\Users\Yoshi\Documents` |
| `/` | Slash commands | `/settings` |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/settings` | Open settings (API key, model) |
| `/reload` | Reload the app |
| `/clear` | Clear search input |
| `/quit` | Close Trim |

### Keyboard

- **Arrow Up/Down** — navigate results
- **Enter** — execute selected result
- **Tab** — autocomplete slash commands
- **Escape** — hide window

## Gemini AI Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Open Trim, type `/settings`, press Enter
3. Paste your API key and click Save
4. Type `? hello` to test

The AI uses `gemini-2.5-flash` with Google Search grounding for real-time web results.

## Kill Stale Instances

If Trim behaves oddly or you see duplicate windows:

```bash
npm run kill
```

Or directly:
```bash
taskkill /F /IM electron.exe
```

> **Note**: This kills *all* Electron processes, including VS Code if running. To be more targeted: use Task Manager and end only the "Trim" processes.

## Build to .exe

```bash
npm run build
```

Output goes to `dist/`. Requires `assets/icon.ico` for the app icon.

## Project Structure

```
Trim/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js             # Entry point, lifecycle
│   │   ├── windowManager.js    # Window creation, acrylic, show/hide
│   │   ├── globalHotkey.js     # Ctrl+Space registration
│   │   └── ipcHandlers.js      # IPC handlers (apps, AI, folders, settings)
│   ├── renderer/       # UI (runs in Chromium)
│   │   ├── index.html          # Main HTML
│   │   ├── preload.js          # Secure IPC bridge (window.trim.*)
│   │   ├── renderer.js         # Boot script, module loader
│   │   ├── inputRouter.js      # Prefix detection → dispatch
│   │   ├── ui.js               # Result rendering, keyboard nav
│   │   ├── styles/             # CSS (main, search, settings, animations)
│   │   └── modules/
│   │       ├── appSearch.js    # Windows app search + icons
│   │       ├── aiQuery.js      # Gemini AI with grounding
│   │       ├── calculator.js   # Math evaluation
│   │       ├── folderSearch.js # File/folder browser
│   │       ├── commands.js     # Slash command registry
│   │       └── settings.js     # Settings panel
│   └── shared/
│       └── constants.js        # Prefixes, IPC channels, defaults
├── scripts/
│   ├── enumerateApps.ps1       # PowerShell: find installed apps
│   └── extractIcon.ps1         # PowerShell: extract .exe icons
├── launch.js           # Launcher (cleans ELECTRON_RUN_AS_NODE env)
├── start.bat           # Windows batch launcher
└── package.json
```
