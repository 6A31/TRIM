const fs = require('fs');
const path = require('path');

const pidFile = path.join(__dirname, '..', '.trim-dev.pid');

function readPid() {
  try {
    const raw = fs.readFileSync(pidFile, 'utf-8').trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

function removePidFile() {
  try { fs.unlinkSync(pidFile); } catch {}
}

const pid = readPid();
if (!pid) {
  console.log('No Trim PID file found. Nothing to kill.');
  process.exit(0);
}

try {
  process.kill(pid);
  removePidFile();
  console.log(`Stopped Trim process ${pid}.`);
} catch (err) {
  removePidFile();
  console.log(`Trim process ${pid} was not running.`);
}

process.exit(0);
