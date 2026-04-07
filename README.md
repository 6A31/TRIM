# TRIM

[![Download](https://img.shields.io/github/v/release/6A31/TRIM?label=Download&style=for-the-badge)](https://github.com/6A31/TRIM/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/6A31/TRIM/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/6A31/TRIM/releases/latest)

A keyboard-first launcher for Windows and macOS. Think Spotlight, but with AI built in.

TRIM sits behind **Ctrl+Space** (Option+Space on Mac), gives you a single search bar with an acrylic glass UI, and gets out of your way.

![App Search](assets/screenshots/app-search.png)

## Features

### App Search

Type anything to instantly search your installed apps. Results rank by launch frequency, so your most-used apps float to the top. Fuzzy matching means `vsc` finds Visual Studio Code.

- **Windows**: Start Menu shortcuts + Microsoft Store / UWP apps
- **macOS**: `.app` bundles from `/Applications`, `/System/Applications`, and `~/Applications`

### AI Chat

Prefix with `?` for Gemini Flash or `??` for Gemini Pro. Responses are grounded with live Google Search, render full Markdown with syntax highlighting, LaTeX math, and one-click copy on code blocks.

Conversations persist between toggles — hide the window, bring it back, keep chatting. Backspace the prefix to start fresh.

![AI Chat](assets/screenshots/ai-chat.png)

### Python Execution

More than just plotting — the AI installs packages, runs full scripts, and returns results inline. Toggle **Force Code** to make every query use deterministic Python instead of LLM reasoning, so math, data analysis, and logic get real answers, not approximations.

![Python Execution](assets/screenshots/ai-python.png)

### File References

Type `#` followed by a filename inside any AI query to attach it as context. Works with text files, PDFs, and images.

![File References](assets/screenshots/file-references.png)

### File Automation

The AI can read, create, edit, and delete files through tool calls. Every mutating operation shows a confirmation prompt with a diff preview before anything touches disk.

![File Automation](assets/screenshots/ai-textreplace.png)

### Calculator

`c: 2+2` gives you `4` instantly. Supports trig, roots, logarithms, constants, percentages, and exponentiation.

### Folder Search

`f: report` recursively searches Desktop, Documents, Downloads, and any custom paths from settings.

![Folder Search](assets/screenshots/folder-search.png)

## Quick Reference

| Prefix | Mode | | Key | Action |
|--------|------|-|-----|--------|
| *(none)* | App search | | **Ctrl+Space** | Toggle TRIM |
| `?` | AI Flash | | **Escape** | Hide |
| `??` | AI Pro | | **Up/Down** | Navigate |
| `c:` | Calculator | | **Enter** | Execute |
| `f:` | Folders | | **Tab** | Autocomplete |
| `cs:` | Solver | | `/` | Commands |

## Install

Grab the latest installer from [Releases](https://github.com/6A31/TRIM/releases/latest), or build from source:

```bash
git clone https://github.com/6A31/TRIM.git
cd TRIM
npm install
npm start
```

Requires [Node.js LTS](https://nodejs.org/). Get a free [Gemini API key](https://aistudio.google.com/apikey), then type `/settings` to paste it in.

## Building

```bash
npm run build:win      # Windows (.exe installer)
npm run build:mac      # macOS (.dmg)
```

## Stack

Electron 41, vanilla JS, [@google/genai](https://www.npmjs.com/package/@google/genai) (Gemini 3 Flash / 3.1 Pro), Python 3 for local code execution. No frameworks.

## License

TRIM Non-Commercial No-Derivatives License (see `LICENSE`).
