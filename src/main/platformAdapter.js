const { execFile } = require('child_process');

function toDataUriFromBuffer(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function listMacApps(fs, path, os) {
  const roots = [
    '/Applications',
    '/System/Applications',
    path.join(os.homedir(), 'Applications'),
  ];

  const seen = new Set();
  const apps = [];

  function walk(dir, depth) {
    if (depth > 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name.toLowerCase().endsWith('.app')) {
        const norm = full.toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        apps.push({
          name: e.name.replace(/\.app$/i, ''),
          target: full,
          lnkPath: full,
          iconPath: full,
        });
        continue;
      }
      if (e.isDirectory() && !e.name.startsWith('.')) {
        walk(full, depth + 1);
      }
    }
  }

  for (const root of roots) walk(root, 0);

  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

function findMacBundlePath(path, filePath) {
  const parts = filePath.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const segment = parts[i - 1] || '';
    if (segment.toLowerCase().endsWith('.app')) {
      return parts.slice(0, i).join(path.sep);
    }
  }
  return null;
}

function findIcnsForBundle(fs, path, bundlePath) {
  const resources = path.join(bundlePath, 'Contents', 'Resources');
  let entries;
  try { entries = fs.readdirSync(resources, { withFileTypes: true }); }
  catch { return null; }

  const icns = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.icns'))
    .map(e => path.join(resources, e.name));

  if (icns.length === 0) return null;
  return icns[0];
}

function createPlatformAdapter(deps) {
  const { app, fs, path, os, shell, nativeImage, runPowerShell, getScriptsPath } = deps;
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  async function listApps() {
    if (isWindows) {
      const script = path.join(getScriptsPath(), 'enumerateApps.ps1');
      const raw = await runPowerShell(script);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }

    if (isMac) {
      return listMacApps(fs, path, os);
    }

    return [];
  }

  async function getPlatformIconDataUri(filePath) {
    if (isWindows) {
      const script = path.join(getScriptsPath(), 'extractIcon.ps1');
      const base64 = await runPowerShell(script, [filePath]);
      return `data:image/png;base64,${base64}`;
    }

    if (isMac) {
      // Prefer Electron's native icon extraction which uses NSWorkspace and
      // handles modern Asset Catalog (.car) icons that don't ship .icns files.
      try {
        const img = await app.getFileIcon(filePath, { size: 'large' });
        if (img && !img.isEmpty()) return img.toDataURL();
      } catch { /* fall through to manual .icns lookup */ }

      // Fallback: manual .icns search for older bundles
      let iconPath = null;
      const lower = (filePath || '').toLowerCase();

      if (lower.endsWith('.app')) {
        iconPath = findIcnsForBundle(fs, path, filePath);
      } else if (lower.endsWith('.icns')) {
        iconPath = filePath;
      } else {
        const bundle = findMacBundlePath(path, filePath);
        if (bundle) iconPath = findIcnsForBundle(fs, path, bundle);
      }

      if (!iconPath) return null;
      const img = nativeImage.createFromPath(iconPath);
      if (img.isEmpty()) return null;
      return img.toDataURL();
    }

    return null;
  }

  async function openApp(appPath) {
    if (isWindows) {
      if (appPath.endsWith('.lnk') || appPath.endsWith('.exe')) {
        await shell.openPath(appPath);
        return;
      }
      // Validate UWP app ID to prevent command injection
      if (!/^[a-zA-Z0-9._!]+$/.test(appPath)) {
        throw new Error('Invalid UWP app identifier');
      }
      await new Promise((resolve) => {
        execFile('cmd.exe', ['/c', `start shell:AppsFolder\\${appPath}`], () => resolve());
      });
      return;
    }

    if (isMac) {
      await new Promise((resolve) => {
        execFile('open', [appPath], () => resolve());
      });
      return;
    }

    await shell.openPath(appPath);
  }

  function getSearchRoots(settings) {
    const home = os.homedir();
    const roots = [
      path.join(home, 'Desktop'),
      path.join(home, 'Documents'),
      path.join(home, 'Downloads'),
      home,
      ...(settings.searchPaths || []),
    ];

    if (isMac) {
      roots.push('/Applications', path.join(home, 'Applications'));
    }

    return roots;
  }

  function getOSLabel() {
    if (isWindows) return 'Windows';
    if (isMac) return 'macOS';
    return 'Linux';
  }

  return {
    id: isWindows ? 'windows' : isMac ? 'mac' : 'linux',
    getOSLabel,
    listApps,
    getPlatformIconDataUri,
    openApp,
    getSearchRoots,
    toDataUriFromBuffer,
  };
}

module.exports = { createPlatformAdapter };
