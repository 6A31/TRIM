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
    try {
      fs.symlinkSync(realDesktop, path.join(appsDir, 'com.example.App.desktop'));
    } catch (err) {
      // Windows without Developer Mode can't create symlinks; nothing to test here
      if (err.code === 'EPERM') { fs.rmSync(tmp, { recursive: true, force: true }); return; }
      throw err;
    }

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

describe('Linux desktop entry helpers', () => {
  const { parseExecLine, cleanChildEnv, parseDesktopEntry } = require('../src/main/platformAdapterLinux');

  it('parseExecLine drops field codes and honours quotes', () => {
    assert.deepEqual(parseExecLine('firefox %u'), ['firefox']);
    assert.deepEqual(parseExecLine('"/opt/My App/app" --flag="a b" %F'), ['/opt/My App/app', '--flag=a b']);
    assert.deepEqual(parseExecLine('echo 100%%'), ['echo', '100%']);
  });

  it('cleanChildEnv strips AppImage runtime paths', () => {
    const env = cleanChildEnv({
      APPDIR: '/tmp/.mount_trim',
      APPIMAGE: '/home/u/TRIM.AppImage',
      PATH: '/tmp/.mount_trim/usr/bin:/usr/bin',
      LD_LIBRARY_PATH: '/tmp/.mount_trim/usr/lib',
      HOME: '/home/u',
    });
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.LD_LIBRARY_PATH, undefined);
    assert.equal(env.APPIMAGE, undefined);
    assert.equal(env.HOME, '/home/u');
  });

  it('parseDesktopEntry reads Terminal and escapes', () => {
    const e = parseDesktopEntry('[Desktop Entry]\nName=My\\sApp\nExec=htop\nTerminal=true\n');
    assert.equal(e.name, 'My App');
    assert.equal(e.terminal, true);
  });
});
