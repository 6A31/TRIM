const { execFile, spawn } = require('child_process');

function parseDesktopEntry(content) {
  let inEntry = false;
  const raw = {};

  for (const line of content.split(/\n/)) {
    const t = line.trim();
    if (t.startsWith('[')) {
      inEntry = t === '[Desktop Entry]';
      continue;
    }
    if (!inEntry || !t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    raw[k] = v;
  }

  const type = (raw.Type || 'Application').trim();
  if (type !== 'Application') return null;
  if (/^(true|1)$/i.test(raw.NoDisplay || '')) return null;
  if (/^(true|1)$/i.test(raw.Hidden || '')) return null;

  const exec = (raw.Exec || '').trim();
  if (!exec) return null;

  let name = raw.Name || raw['Name[en_US]'] || raw['Name[en]'] || '';
  if (!name) {
    const nk = Object.keys(raw).find((k) => k.startsWith('Name['));
    if (nk) name = raw[nk];
  }
  if (!name) return null;

  const icon = (raw.Icon || '').trim();
  return {
    name: unescapeDesktopValue(name),
    exec,
    icon,
    terminal: /^(true|1)$/i.test(raw.Terminal || ''),
    workingDir: (raw.Path || '').trim() || null,
    tryExec: (raw.TryExec || '').trim() || null,
  };
}

/** Desktop Entry spec string escapes: \s \n \t \r \\ */
function unescapeDesktopValue(v) {
  return String(v).replace(/\\([sntr\\])/g, (_m, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' }[c]));
}

/**
 * Split an Exec value into argv per the Desktop Entry spec: double-quoted
 * args may contain spaces and escape ", `, $ and \ with a backslash. Field
 * codes (%f, %U, ...) are dropped, %% becomes %.
 */
function parseExecLine(execLine) {
  const line = unescapeDesktopValue(execLine);
  const args = [];
  let cur = '';
  let inQuotes = false;
  let hasToken = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '\\' && i + 1 < line.length && '"`$\\'.includes(line[i + 1])) {
        cur += line[++i];
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; hasToken = true; continue; }
    if (ch === ' ' || ch === '\t') {
      if (hasToken) { args.push(cur); cur = ''; hasToken = false; }
      continue;
    }
    cur += ch;
    hasToken = true;
  }
  if (hasToken) args.push(cur);

  const out = [];
  for (const a of args) {
    if (/^%[fFuUdDnNickvm]$/.test(a)) continue; // standalone field code
    const cleaned = a.replace(/%%/g, '\u0000').replace(/%[fFuUdDnNickvm]/g, '').replace(/\u0000/g, '%');
    if (cleaned) out.push(cleaned);
  }
  return out;
}

function commandExists(fs, pathMod, cmd) {
  if (!cmd) return false;
  if (cmd.includes('/')) {
    try { fs.accessSync(cmd, fs.constants.X_OK); return true; } catch { return false; }
  }
  for (const dir of (process.env.PATH || '').split(':')) {
    if (!dir) continue;
    try {
      fs.accessSync(pathMod.join(dir, cmd), fs.constants.X_OK);
      return true;
    } catch { /* keep looking */ }
  }
  return false;
}

/**
 * Environment for launched apps. Inside an AppImage the runtime adds APPDIR,
 * APPIMAGE, OWD, ARGV0 and may prepend its own lib/bin dirs, which breaks
 * other programs (wrong libstdc++/GTK, wrong python). Strip all of that.
 */
function cleanChildEnv(env = process.env) {
  const out = { ...env };
  const appDir = env.APPDIR;
  for (const k of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'CHROME_DESKTOP', 'GDK_BACKEND_TRIM']) {
    delete out[k];
  }
  if (appDir) {
    for (const k of ['PATH', 'LD_LIBRARY_PATH', 'XDG_DATA_DIRS', 'PYTHONPATH', 'PERLLIB', 'GSETTINGS_SCHEMA_DIR', 'QT_PLUGIN_PATH', 'GTK_PATH', 'GIO_MODULE_DIR']) {
      if (!out[k]) continue;
      const kept = out[k].split(':').filter(part => part && !part.startsWith(appDir));
      if (kept.length) out[k] = kept.join(':');
      else delete out[k];
    }
  }
  return out;
}

function stripExecFieldCodes(execLine) {
  return execLine
    .replace(/%(?:[uUfFdDnNickvm]|k|v)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandHome(p, home) {
  if (!p) return p;
  if (p.startsWith('~/')) return `${home}${p.slice(1)}`;
  return p;
}

function resolveLinuxIconPath(fs, pathMod, home, iconStr) {
  if (!iconStr) return null;
  const expanded = expandHome(iconStr, home);
  if (expanded.includes(pathMod.sep) || expanded.startsWith('/')) {
    const candidates = [expanded];
    if (!fs.existsSync(expanded)) {
      candidates.push(`${expanded}.png`, `${expanded}.svg`, `${expanded}.xpm`);
    }
    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      } catch { /* */ }
    }
  }

  const base = iconStr;
  const pix = pathMod.join('/usr/share/pixmaps', `${base}.png`);
  try {
    if (fs.existsSync(pix)) return pix;
  } catch { /* */ }

  const sizes = ['512', '256', '128', '96', '64', '48', '32'];
  const iconRoots = [
    pathMod.join(home, '.local', 'share', 'flatpak', 'exports', 'share', 'icons'),
    '/var/lib/flatpak/exports/share/icons',
    pathMod.join(home, '.local', 'share', 'icons'),
    '/usr/share/icons',
  ];
  for (const root of iconRoots) {
    const scalableSvg = pathMod.join(root, 'hicolor', 'scalable', 'apps', `${base}.svg`);
    try {
      if (fs.existsSync(scalableSvg)) return scalableSvg;
    } catch { /* */ }
    for (const size of sizes) {
      const rel = pathMod.join('hicolor', `${size}x${size}`, 'apps', `${base}.png`);
      const full = pathMod.join(root, rel);
      try {
        if (fs.existsSync(full)) return full;
      } catch { /* */ }
    }
  }
  return null;
}

function collectDesktopFiles(fs, pathMod, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.name.endsWith('.desktop')) continue;
    // Flatpak (and some Snap) exports are symlinks to the real .desktop file.
    if (!e.isFile() && !e.isSymbolicLink()) continue;
    out.push(pathMod.join(dir, e.name));
  }
}

/** Application dirs in XDG precedence order (user first), plus Flatpak/Snap exports. */
function getLinuxApplicationDirs(pathMod, home, env = process.env) {
  const dataHome = env.XDG_DATA_HOME || pathMod.join(home, '.local', 'share');
  const dataDirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  const dirs = [
    pathMod.join(dataHome, 'applications'),
    pathMod.join(dataHome, 'flatpak', 'exports', 'share', 'applications'),
    ...dataDirs.map(d => pathMod.join(d, 'applications')),
    '/var/lib/flatpak/exports/share/applications',
    '/usr/local/share/applications',
    '/usr/share/applications',
    '/var/lib/snapd/desktop/applications',
  ];
  return [...new Set(dirs)];
}

function listLinuxApps(fs, pathMod, os) {
  const home = os.homedir();
  const dirs = getLinuxApplicationDirs(pathMod, home);

  // Desktop file ID = basename; the first directory wins, so a user copy in
  // ~/.local/share/applications (including Hidden=true overrides) shadows the
  // system one instead of producing duplicates.
  const seenIds = new Set();
  const seenPaths = new Set();
  const apps = [];

  for (const dir of dirs) {
    const files = [];
    collectDesktopFiles(fs, pathMod, dir, files);
    for (const full of files) {
      const id = pathMod.basename(full);
      if (seenIds.has(id)) continue;
      let realPath = full;
      try { realPath = fs.realpathSync(full); } catch { /* broken symlink */ }
      if (seenPaths.has(realPath)) continue;

      let content;
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      seenIds.add(id);
      seenPaths.add(realPath);
      const parsed = parseDesktopEntry(content);
      if (!parsed) continue;
      if (parsed.tryExec && !commandExists(fs, pathMod, parsed.tryExec)) continue;

      const execStripped = stripExecFieldCodes(parsed.exec);
      if (!execStripped) continue;

      apps.push({
        name: parsed.name,
        target: full,
        lnkPath: full,
        iconPath: parsed.icon || null,
      });
    }
  }

  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

function readDesktopIconFromFile(fs, pathMod, desktopPath) {
  let content;
  try {
    content = fs.readFileSync(desktopPath, 'utf-8');
  } catch {
    return null;
  }
  let inEntry = false;
  for (const line of content.split(/\n/)) {
    const t = line.trim();
    if (t.startsWith('[')) {
      inEntry = t === '[Desktop Entry]';
      continue;
    }
    if (!inEntry || !t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k === 'Icon') return v || null;
  }
  return null;
}

function getLinuxSearchExtras(settings, pathMod, os) {
  const home = os.homedir();
  const roots = [];
  const desk = process.env.XDG_DESKTOP_DIR;
  if (desk) roots.push(desk);
  return roots;
}

function spawnDetached(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { detached: true, stdio: 'ignore', env: cleanChildEnv(), ...opts });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}

const TERMINALS = [
  ['x-terminal-emulator', ['-e']], ['kgx', ['--']], ['gnome-terminal', ['--']], ['konsole', ['-e']],
  ['xfce4-terminal', ['-x']], ['alacritty', ['-e']], ['kitty', []], ['foot', []], ['wezterm', ['start', '--']],
  ['tilix', ['-e']], ['xterm', ['-e']],
];

/** Launch from the Exec= line ourselves (used when gio isn't available). */
async function launchDesktopEntryManually(fs, pathMod, desktopPath) {
  let content;
  try { content = fs.readFileSync(desktopPath, 'utf-8'); } catch { return false; }
  const parsed = parseDesktopEntry(content);
  if (!parsed) return false;
  let argv = parseExecLine(parsed.exec);
  if (!argv.length) return false;
  if (parsed.terminal) {
    const termEnv = process.env.TERMINAL;
    const term = (termEnv && commandExists(fs, pathMod, termEnv) && [termEnv, ['-e']])
      || TERMINALS.find(([t]) => commandExists(fs, pathMod, t));
    if (term) argv = [term[0], ...term[1], ...argv];
  }
  let cwd;
  if (parsed.workingDir) {
    try { if (fs.statSync(parsed.workingDir).isDirectory()) cwd = parsed.workingDir; } catch { /* */ }
  }
  return spawnDetached(argv[0], argv.slice(1), cwd ? { cwd } : {});
}

async function openLinuxApp(appPath, shell, deps = {}) {
  const fs = deps.fs || require('fs');
  const pathMod = deps.path || require('path');
  const lower = (appPath || '').toLowerCase();
  if (lower.endsWith('.desktop')) {
    // xdg-open on a .desktop file opens it in a text editor on most desktops.
    // gio launch runs it properly (Terminal=, DBusActivatable, startup notify).
    if (commandExists(fs, pathMod, 'gio')) {
      const ok = await new Promise((resolve) => {
        execFile('gio', ['launch', appPath], { env: cleanChildEnv(), timeout: 10000 }, (err) => resolve(!err));
      });
      if (ok) return;
    }
    if (await launchDesktopEntryManually(fs, pathMod, appPath)) return;
    // Last resort: gtk-launch takes the desktop file ID
    if (commandExists(fs, pathMod, 'gtk-launch')) {
      await spawnDetached('gtk-launch', [pathMod.basename(appPath, '.desktop')]);
    }
    return;
  }
  await shell.openPath(appPath);
}

module.exports = {
  listLinuxApps,
  parseDesktopEntry,
  parseExecLine,
  cleanChildEnv,
  getLinuxApplicationDirs,
  collectDesktopFiles,
  resolveLinuxIconPath,
  readDesktopIconFromFile,
  getLinuxSearchExtras,
  openLinuxApp,
};
