# TRIM

[![Download](https://img.shields.io/github/v/release/6A31/TRIM?label=Download&style=for-the-badge)](https://github.com/6A31/TRIM/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/6A31/TRIM/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/6A31/TRIM/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/6A31/TRIM/releases/latest)

A launcher for Windows, macOS, and Linux. Spotlight-ish, but with AI.

On Windows and macOS, **Alt+Space** (Option+Space on Mac) toggles the bar. Change it in `/settings`. On Linux, TRIM can't register a global shortcut; you bind one in your window manager (see below). Frosted acrylic on Windows 11, otherwise it stays out of your way.

![App Search](assets/screenshots/app-search.png)

## Features

### App Search

Start typing to find apps. Results sort by how often you use them, and fuzzy matching works (`vsc` finds Visual Studio Code).

- **Windows**: Start Menu shortcuts + Microsoft Store / UWP apps
- **macOS**: `.app` bundles from `/Applications`, `/System/Applications`, and `~/Applications`
- **Linux**: `.desktop` entries from `~/.local/share/applications`, `/usr/share/applications`, Flatpak, Snap

### AI Chat

Prefix with `?` for Gemini Flash or `??` for Gemini Pro. Answers use live Google Search and render Markdown with syntax highlighting, LaTeX, and copy buttons on code blocks.

Conversations stick around when you hide the window. Backspace the prefix to start a new chat.

![AI Chat](assets/screenshots/ai-chat.png)

### Python Execution

The AI can install packages, run scripts, and return real output, not just plots. **Force Code** makes every query run Python instead of letting the model guess.

Windows, macOS, and Linux builds can ship with a bundled Python runtime. Set `TRIM_SKIP_BUNDLED_PYTHON=1` to use system Python during development.

![Python Execution](assets/screenshots/ai-python.png)

### File References

`#filename` in an AI query attaches that file as context. Text, PDFs, and images work.

![File References](assets/screenshots/file-references.png)

### File Automation

The AI can read, create, edit, and delete files. Destructive changes show a diff and ask for confirmation first.

![File Automation](assets/screenshots/ai-textreplace.png)

### Image Generation

Ask for an image and it shows up inline. Copy to clipboard or save from the hover buttons.

![Image Generation](assets/screenshots/ai-image-gen.png)

### Math

`c:` runs a local symbolic engine (no API calls).

- `c: 2+2` → instant evaluation
- `c: x^2-4=0` → symbolic solving with steps
- `c: derive x^3` → differentiation, integration, factoring
- `c: sin(x)` → interactive 2D plot with hover
- `c: x^2+y^2` → 3D surface plot with rotation

KaTeX rendering, collapsible steps, and an **AI Explain** chip if you want plain English.

If your expression has variables, they show under the result (handy for catching `syn` vs `sin`).

<details>
<summary><strong>Calculator Function Reference</strong></summary>

#### Arithmetic & Constants
| Input | Description | Example |
|-------|-------------|---------|
| `+` `-` `*` `/` `^` | Basic operators | `c: 2^10` → 1024 |
| `%` | Percentage | `c: 200 * 50%` → 100 |
| `pi` | π ≈ 3.14159 | `c: 2*pi` |
| `e` | Euler's number ≈ 2.71828 | `c: e^2` |

#### Functions (Numeric)
| Function | Description | Example |
|----------|-------------|---------|
| `sin` `cos` `tan` | Trigonometric | `c: sin(pi/2)` → 1 |
| `asin` `acos` `atan` | Inverse trig | `c: asin(1)` → 1.5708 |
| `sqrt` | Square root | `c: sqrt(144)` → 12 |
| `cbrt` | Cube root | `c: cbrt(27)` → 3 |
| `abs` | Absolute value | `c: abs(-42)` → 42 |
| `log` | Base-10 logarithm | `c: log(100)` → 2 |
| `ln` | Natural logarithm | `c: ln(e)` → 1 |
| `exp` | Exponential (e^x) | `c: exp(1)` → 2.71828 |
| `round` `ceil` `floor` | Rounding | `c: floor(3.7)` → 3 |
| `gcd` / `ggT` | Greatest common divisor | `c: gcd(12, 8)` → 4 |
| `lcm` / `kgV` | Least common multiple | `c: lcm(4, 6)` → 12 |

Functions can be nested: `c: sin(gcd(4, 5))`, `c: sqrt(gcd(16, 64))` → 4

#### Symbolic Operations
| Prefix | Description | Example |
|--------|-------------|---------|
| `derive` / `diff` | Differentiation | `c: derive sin(x)` → cos(x) |
| `integrate` | Integration | `c: integrate x^2` → x³/3 + C |
| `factor` | Factorize | `c: factor x^2-4` → (x-2)(x+2) |
| `expand` | Expand | `c: expand (x+1)^3` |
| `simplify` | Simplify | `c: simplify sin(x)^2+cos(x)^2` → 1 |

#### Solving
Type any equation with `=` and variables: `c: x^2 - 5x + 6 = 0` → x = 2, x = 3

#### Plotting
Expressions with variables are plotted automatically:
- **2D**: `c: sin(x)`, `c: x^2 - 4` - interactive line chart
- **3D**: `c: x^2 + y^2` - rotatable surface plot
- **Explicit**: `c: plot sin(x)` / `c: graph x^2`

</details>

![Math](assets/screenshots/calculator-solver.png)

![3D Plot](assets/screenshots/calculator-3d-plot.png)

### Folder Search

`f: report` searches Desktop, Documents, Downloads, and any extra paths you add in settings.

![Folder Search](assets/screenshots/folder-search.png)

## Quick Reference

| Prefix | Mode | | Key | Action |
|--------|------|-|-----|--------|
| *(none)* | App search | | **Alt+Space** (Win/mac) | Toggle TRIM |
| `?` | AI Flash | | **Escape** | Hide |
| `??` | AI Pro | | **Up/Down** | Navigate |
| `c:` | Math | | **Enter** | Execute |
| `f:` | Folders | | **Tab** | Autocomplete |
| | | | `/` | Commands |

On Linux, bind your compositor to `"$APPIMAGE" --toggle` (or the full AppImage path). See **Install**.

## Install

### Windows / macOS

Download from [Releases](https://github.com/6A31/TRIM/releases/latest):

- **Windows**: run the `.exe` installer
- **macOS**: open the `.dmg` and drag TRIM to Applications

### Linux

Linux builds are AppImages only (no `.deb` or `.rpm` yet).

1. Download `TRIM-…-Linux-x86_64.AppImage` from [Releases](https://github.com/6A31/TRIM/releases/latest).
2. Move it somewhere permanent and `chmod +x` it.
3. On Arch you might need `sudo pacman -S fuse2`.
4. Run it once.

TRIM has to stay running for toggles to work. Autostart it hidden:

```bash
"/path/to/TRIM.AppImage" --hidden
```

Or turn on **Launch on startup** in `/settings` (packaged builds pass `--hidden` automatically).

Bind a key in your compositor:

```bash
"/path/to/TRIM.AppImage" --toggle
```

Hyprland example:

```
bind = SUPER, SPACE, exec, "/path/to/TRIM.AppImage" --toggle
```

Each keybind exec spins up a short helper process (AppImage mount + Electron). ~150ms before toggle on packaged builds. Normal.

Escape closes the bar. Click-away dismiss is off on Linux so tiling WMs and focus-follows-mouse don't close it accidentally. Set `TRIM_LINUX_BLUR_DISMISS=1` if you want click-away back.

`/settings` on Linux shows your paths and copies the commands if you're already running the AppImage.

### From source

```bash
git clone https://github.com/6A31/TRIM.git
cd TRIM
npm install
npm start
```

You'll need [Node.js LTS](https://nodejs.org/). For AI, grab a free [Gemini API key](https://aistudio.google.com/apikey) and paste it in via `/settings`.

Dev toggle from the repo: `npx electron . --toggle` (separate config from the packaged app).

## Building

```bash
npm run build:win      # Windows (.exe installer)
npm run build:mac      # macOS (.dmg)
npm run build:linux     # Linux (AppImage)
```

## Stack

Electron 41, vanilla JS (no frameworks), [@google/genai](https://www.npmjs.com/package/@google/genai) for Gemini 3 Flash / 3.1 Pro, bundled Python for local code execution.

## License

TRIM Non-Commercial No-Derivatives License (see `LICENSE`).
