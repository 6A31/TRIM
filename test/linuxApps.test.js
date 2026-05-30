const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listLinuxApps, collectDesktopFiles } = require('../src/main/platformAdapterLinux');

describe('Linux app discovery', () => {
  it('collectDesktopFiles includes symlinked .desktop entries (Flatpak exports)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-linux-apps-'));
    const appsDir = path.join(tmp, 'applications');
    fs.mkdirSync(appsDir, { recursive: true });

    const realDesktop = path.join(tmp, 'com.example.App.desktop');
    fs.writeFileSync(
      realDesktop,
      `[Desktop Entry]
Type=Application
Name=Example Flatpak
Exec=flatpak run com.example.App
Icon=com.example.App
`,
      'utf-8',
    );
    fs.symlinkSync(realDesktop, path.join(appsDir, 'com.example.App.desktop'));

    const out = [];
    collectDesktopFiles(fs, path, appsDir, out);
    assert.equal(out.length, 1);
    assert.ok(out[0].endsWith('com.example.App.desktop'));

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('finds Spotify when system Flatpak exports are present', () => {
    const flatpakDir = '/var/lib/flatpak/exports/share/applications';
    if (!fs.existsSync(flatpakDir)) return;

    const apps = listLinuxApps(fs, path, os);
    const spotify = apps.find((a) => /spotify/i.test(a.name));
    assert.ok(spotify, 'expected Spotify from Flatpak exports');
    assert.match(spotify.target, /\.desktop$/);
  });
});
