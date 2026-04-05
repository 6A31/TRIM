const { execSync, spawn } = require('child_process');
const path = require('path');

// Kill previous instances
try { execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' }); } catch {}

const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
  cwd: __dirname,
  env,
  stdio: 'ignore',
  detached: true,
});

child.unref();
process.exit(0);
