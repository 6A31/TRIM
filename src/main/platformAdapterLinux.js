const { execFile } = require('child_process');

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
  return { name, exec, icon };
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
  const roots = [
    pathMod.join(home, '.local', 'share', 'icons'),
    '/usr/share/icons',
  ];
  for (const root of roots) {
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
    if (!e.isFile() || !e.name.endsWith('.desktop')) continue;
    out.push(pathMod.join(dir, e.name));
  }
}

function listLinuxApps(fs, pathMod, os) {
  const home = os.homedir();
  // User + system .desktop dirs; Flatpak/Snap export launchers outside ~/.local/share/applications.
  const dirs = [
    pathMod.join(home, '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
    pathMod.join(home, '.local', 'share', 'applications'),
    '/var/lib/flatpak/exports/share/applications',
    '/usr/share/applications',
    '/var/lib/snapd/desktop/applications',
  ];
  const files = [];
  for (const d of dirs) collectDesktopFiles(fs, pathMod, d, files);

  const seen = new Set();
  const apps = [];

  for (const full of files) {
    let content;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseDesktopEntry(content);
    if (!parsed) continue;

    const norm = full.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);

    const execStripped = stripExecFieldCodes(parsed.exec);
    if (!execStripped) continue;

    apps.push({
      name: parsed.name,
      target: full,
      lnkPath: full,
      iconPath: parsed.icon || null,
    });
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

function openLinuxApp(appPath, shell) {
  const lower = (appPath || '').toLowerCase();
  if (lower.endsWith('.desktop')) {
    return new Promise((resolve) => {
      execFile('xdg-open', [appPath], { env: { ...process.env } }, () => resolve());
    });
  }
  return shell.openPath(appPath);
}

module.exports = {
  listLinuxApps,
  resolveLinuxIconPath,
  readDesktopIconFromFile,
  getLinuxSearchExtras,
  openLinuxApp,
};
