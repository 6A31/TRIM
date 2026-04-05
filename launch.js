const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronPath = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const pidFile = path.join(__dirname, '.trim-dev.pid');

const child = spawn(electronPath, ['.'], {
  cwd: __dirname,
  env,
  stdio: 'ignore',
  detached: true,
});

try {
  fs.writeFileSync(pidFile, String(child.pid), 'utf-8');
} catch {}

child.unref();
process.exit(0);
