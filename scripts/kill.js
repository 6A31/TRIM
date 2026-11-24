const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const pidFile = path.join(__dirname, '..', '.trim-dev.pid');
const isWin = process.platform === 'win32';

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

// Kill entire process tree (main + renderer + GPU + utility processes)
function killTree(pid) {
  try {
    if (isWin) {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      // Kill the process group (negative PID) to catch all children
      try { process.kill(-pid, 'SIGKILL'); } catch {
        // If process group kill fails, fall back to single process
        process.kill(pid, 'SIGKILL');
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Find and kill orphaned Electron processes from this project
function killOrphans() {
  const projectDir = path.resolve(__dirname, '..');
  let killed = 0;
  try {
    if (isWin) {
      // Find electron.exe processes whose command line references this project.
      // wmic is gone on recent Windows 11, so prefer CIM via PowerShell.
      let out = '';
      const psScript = "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ForEach-Object { \"$($_.CommandLine),$($_.ProcessId)\" }";
      try {
        out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
          encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        try {
          out = execSync(
            'wmic process where "name=\'electron.exe\'" get ProcessId,CommandLine /format:csv',
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
          );
        } catch { /* nothing to kill */ }
      }
      const needle = projectDir.toLowerCase();
      for (const line of out.split(/\r?\n/)) {
        if (!line.toLowerCase().includes(needle)) continue;
        const match = line.match(/,(\d+)\s*$/);
        if (match) {
          const pid = Number(match[1]);
          try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); killed++; } catch {}
        }
      }
    } else {
      // macOS/Linux: find electron/Electron processes started from this project
      const out = execSync('ps -eo pid,command', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      for (const line of out.split('\n')) {
        const lower = line.toLowerCase();
        if (!(lower.includes('electron') && line.includes(projectDir))) continue;
        const match = line.trim().match(/^(\d+)/);
        if (match) {
          const pid = Number(match[1]);
          if (pid === process.pid) continue; // don't kill ourselves
          try { process.kill(pid, 'SIGKILL'); killed++; } catch {}
        }
      }
    }
  } catch {}
  return killed;
}

// 1. Kill by PID file
const pid = readPid();
let killedByPid = false;
if (pid) {
  killedByPid = killTree(pid);
  removePidFile();
  if (killedByPid) {
    console.log(`Stopped Trim process tree (PID ${pid}).`);
  } else {
    console.log(`Trim process ${pid} was not running.`);
  }
}

// 2. Sweep for any orphaned Electron processes from this project
const orphans = killOrphans();
if (orphans > 0) {
  console.log(`Killed ${orphans} orphaned Electron process${orphans > 1 ? 'es' : ''}.`);
}

if (!pid && orphans === 0) {
  console.log('No Trim processes found. Nothing to kill.');
}

process.exit(0);
