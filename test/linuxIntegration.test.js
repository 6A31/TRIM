// Linux app discovery + launch, exercised against real files and real processes.
// Runs on any OS: XDG dirs point at a temp tree, and the launched "app" is node
// itself writing a marker file, so this covers Exec parsing, precedence rules,
// detached spawning and the AppImage env cleanup end to end.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { listLinuxApps, openLinuxApp } = require('../src/main/platformAdapterLinux');

function desktop(fields) {
  return ['[Desktop Entry]', 'Type=Application', ...Object.entries(fields).map(([k, v]) => `${k}=${v}`), ''].join('\n');
}

// Desktop Entry Exec quoting: wrap in "" and escape " ` $ \ with a backslash
function execQuote(arg) {
  return `"${arg.replace(/(["`$\\])/g, '\\$1')}"`;
}

describe('Linux integration (real fs + processes)', () => {
  let tmp;
  let dataHome;
  let sysDir;
  const savedEnv = {};

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-linux-int-'));
    dataHome = path.join(tmp, 'home', '.local', 'share');
    sysDir = path.join(tmp, 'usr', 'share');
    fs.mkdirSync(path.join(dataHome, 'applications'), { recursive: true });
    fs.mkdirSync(path.join(sysDir, 'applications'), { recursive: true });
    for (const k of ['XDG_DATA_HOME', 'XDG_DATA_DIRS', 'APPDIR', 'APPIMAGE']) savedEnv[k] = process.env[k];
    process.env.XDG_DATA_HOME = dataHome;
    process.env.XDG_DATA_DIRS = sysDir;
  });

  after(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('applies XDG precedence: user entries shadow system ones, Hidden=true hides them', () => {
    const sysApps = path.join(sysDir, 'applications');
    const userApps = path.join(dataHome, 'applications');
    fs.writeFileSync(path.join(sysApps, 'editor.desktop'), desktop({ Name: 'System Editor', Exec: 'editor %F' }));
    fs.writeFileSync(path.join(userApps, 'editor.desktop'), desktop({ Name: 'My Editor', Exec: 'editor --custom %F' }));
    fs.writeFileSync(path.join(sysApps, 'ads.desktop'), desktop({ Name: 'Adware', Exec: 'ads' }));
    fs.writeFileSync(path.join(userApps, 'ads.desktop'), desktop({ Name: 'Adware', Exec: 'ads', Hidden: 'true' }));
    fs.writeFileSync(path.join(sysApps, 'gone.desktop'), desktop({ Name: 'Missing Binary', Exec: 'x', TryExec: '/definitely/not/here' }));
    fs.writeFileSync(path.join(sysApps, 'files.desktop'), desktop({ Name: 'Files\\sManager', Exec: 'nautilus' }));

    const apps = listLinuxApps(fs, path, os);
    const names = apps.map(a => a.name);
    assert.ok(names.includes('My Editor'), 'user override is listed');
    assert.ok(!names.includes('System Editor'), 'shadowed system entry is not duplicated');
    assert.ok(!names.includes('Adware'), 'Hidden=true user override hides the system entry');
    assert.ok(!names.includes('Missing Binary'), 'TryExec pointing nowhere is skipped');
    assert.ok(names.includes('Files Manager'), 'escapes in Name are decoded');
  });

  it('launches a .desktop entry as a real detached process with a clean env', async () => {
    const marker = path.join(tmp, 'launched.json');
    const script = path.join(tmp, 'fake app.js'); // space on purpose: exercises Exec quoting
    fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ argv: process.argv.slice(2), appdir: process.env.APPDIR || null, appimage: process.env.APPIMAGE || null, cwd: process.cwd() }));`);
    const workDir = path.join(tmp, 'work dir');
    fs.mkdirSync(workDir);
    const entry = path.join(dataHome, 'applications', 'fake.desktop');
    fs.writeFileSync(entry, desktop({
      Name: 'Fake App',
      Exec: `${execQuote(process.execPath)} ${execQuote(script)} --flag "two words" 100%% %U`,
      Path: workDir,
    }));

    // Pretend we're running inside an AppImage: these must not leak into the child
    process.env.APPDIR = path.join(tmp, '.mount_trim');
    process.env.APPIMAGE = path.join(tmp, 'TRIM.AppImage');

    const shellStub = { openPath: async () => { throw new Error('should not fall back to openPath'); } };
    await openLinuxApp(entry, shellStub, { fs, path });

    const deadline = Date.now() + 10000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    assert.ok(fs.existsSync(marker), 'the app process ran');
    const got = JSON.parse(fs.readFileSync(marker, 'utf-8'));
    assert.deepEqual(got.argv, ['--flag', 'two words', '100%'], 'Exec args parsed, %U dropped, %% unescaped');
    assert.equal(got.appdir, null, 'APPDIR stripped');
    assert.equal(got.appimage, null, 'APPIMAGE stripped');
    assert.equal(fs.realpathSync(got.cwd), fs.realpathSync(workDir), 'Path= used as working dir');
  });
});
