# Trim

A keyboard-first launcher for Windows 11. Think Spotlight, but for Windows — with AI built in.

![Trim hero screenshot](placeholder-hero.png)

Trim sits behind **Ctrl+Space**, gives you a single search bar with an acrylic glass UI, and gets out of your way. Search apps, ask Gemini questions with live web results, do math, browse files, and automate your filesystem — all without touching the mouse.

## Features

### App Search

Type anything and Trim instantly searches your installed apps — both traditional Start Menu shortcuts and Microsoft Store / UWP apps. Results are ranked by how often you launch them, so your most-used apps float to the top. Fuzzy matching means you can type `vsc` and get Visual Studio Code.

![App search results](placeholder-app-search.png)

### AI Chat (Gemini)

Prefix with `?` for Gemini Flash or `??` for Gemini Pro. Responses are grounded with live Google Search, so you get current answers instead of stale training data. Conversations persist between toggles — hide the window, bring it back, keep chatting. Backspace the `?` to start a new conversation.

![AI conversation](placeholder-ai-chat.png)

Responses render full Markdown with syntax-highlighted code blocks, LaTeX math, and one-click copy on every code block.

### Python Execution

The AI runs Python code locally when it needs to compute something. Matplotlib plots render inline. Toggle **Force Code** to make the AI always reach for deterministic Python instead of winging it with LLM reasoning — useful for anything involving actual math.

![Python plot inline](placeholder-python-plot.png)

### File Automation

The AI can read, create, edit, and delete files on your system through dedicated tool calls. Every mutating operation shows an inline confirmation prompt with a preview of what's about to change before anything touches disk. Read and list operations run without asking.

![File operation confirmation](placeholder-file-confirm.png)

### File References

Type `#` followed by a filename inside any AI query to attach file contents as context. Trim shows an inline file picker as you type, and the selected file gets sent to Gemini. Works with text files, PDFs, and images.

### Calculator

`c: 2+2` gives you `4` instantly. Supports trig, roots, logarithms, constants (`pi`, `e`), percentages, and exponentiation. Click the result to copy.

### Folder Search

`f: report` recursively searches Desktop, Documents, and Downloads for matching files and folders. Depth-limited to keep things fast.

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/settings` | Open settings panel |
| `/reload` | Reload the UI |
| `/clear` | Clear conversation and temp files |
| `/help` | Show all prefixes and features |

## Prefixes

| Prefix | Mode |
|--------|------|
| *(none)* | App search |
| `?` | AI (Gemini Flash) |
| `??` | AI (Gemini Pro) |
| `c:` | Calculator |
| `f:` | File / folder search |
| `cs:` | Solver |
| `/` | Commands |
| `#file` | Attach file to AI query |

## Keyboard

| Key | Action |
|-----|--------|
| **Ctrl+Space** | Toggle Trim |
| **Escape** | Hide window |
| **Arrow Up/Down** | Navigate results |
| **Enter** | Execute / send |
| **Tab** | Autocomplete file picker |

## Setup

Requires [Node.js LTS](https://nodejs.org/) and Windows 11.

```bash
git clone https://github.com/your-username/trim.git
cd trim
npm install
```

Get a [Gemini API key](https://aistudio.google.com/apikey) (free tier is fine), then:

```bash
npm start
```

Type `/settings`, paste your API key, and save. Try `? hello` to make sure it works.

> **VS Code / Claude Code terminal**: If `npm start` doesn't work (because `ELECTRON_RUN_AS_NODE` is set in those environments), use `start.bat` instead.

## Kill Stale Instances

```bash
npm run kill
```

> This kills all Electron processes including VS Code. Use Task Manager for a targeted kill.

## Building

```bash
npm run build
```

Produces a standalone `.exe` installer in `dist/` via electron-builder.

## Stack

- **Electron 41** — frameless acrylic window, context isolation, single instance lock
- **Vanilla JS + CSS** — no frameworks, just `<script>` tags and CSS custom properties
- **@google/genai** — Gemini 3 Flash / 3.1 Pro with Google Search grounding + function calling
- **PowerShell** — enumerates Start Menu shortcuts and UWP apps, extracts `.exe` icons as base64 PNG
- **Python 3** — local code execution sandbox for AI tool use

## Project Structure

```
src/
├── main/
│   ├── main.js             # Entry point, app lifecycle
│   ├── windowManager.js    # Frameless window, acrylic, show/hide/resize
│   ├── globalHotkey.js     # Ctrl+Space global shortcut
│   └── ipcHandlers.js      # All IPC: apps, AI, files, settings, caching
├── renderer/
│   ├── index.html
│   ├── renderer.js         # Boot, event wiring
│   ├── preload.js          # contextBridge → window.trim.* API
│   ├── inputRouter.js      # Prefix detection → module dispatch
│   ├── ui.js               # DOM rendering, keyboard nav, confirmations
│   ├── modules/
│   │   ├── appSearch.js    # Fuzzy search + usage ranking
│   │   ├── aiQuery.js      # Gemini conversations with memory
│   │   ├── calculator.js   # Safe math eval
│   │   ├── folderSearch.js # Recursive file/folder search
│   │   ├── commands.js     # Slash command registry
│   │   ├── chips.js        # Contextual toggle chips (Force Code)
│   │   └── settings.js     # Settings panel
│   └── styles/
│       ├── main.css        # Dark theme, CSS variables
│       ├── search.css      # Search bar, results, AI responses
│       ├── settings.css    # Settings panel
│       └── animations.css  # Transitions
└── shared/
    └── constants.js        # Prefixes, IPC channels, defaults

scripts/
├── enumerateApps.ps1       # Scan Start Menu + UWP → JSON
└── extractIcon.ps1         # .exe → base64 PNG icon
```

## Caching

App lists, icons, and launch frequencies are persisted as JSON in the Electron `userData` directory. On startup, cached results appear instantly while a background refresh runs. Clear everything from Settings → Clear Cache.

## License

ISC
