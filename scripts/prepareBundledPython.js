const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');

// ---- Configuration ----

const PYTHON_VERSION_WIN = '3.12.10';
const PYTHON_VERSION_MAC = '3.12.13';
const PBS_RELEASE = '20260408';

const WIN_ARCHS = {
  x64:   { packageId: 'python',      resourceDir: 'windows-x64' },
  arm64: { packageId: 'pythonarm64', resourceDir: 'windows-arm64' },
  ia32:  { packageId: 'pythonx86',   resourceDir: 'windows-ia32' },
};

const MAC_ARCHS = {
  arm64: { target: 'aarch64-apple-darwin', resourceDir: 'macos-arm64' },
  x64:   { target: 'x86_64-apple-darwin',  resourceDir: 'macos-x64' },
};

// ---- Helpers ----

function log(message) {
  process.stdout.write(`[bundled-python] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[bundled-python] ${message}\n`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isCached(runtimeRoot, version) {
  const marker = path.join(runtimeRoot, '.trim-python-version');
  if (!fs.existsSync(marker)) return false;
  return fs.readFileSync(marker, 'utf-8').trim() === version;
}

function writeMarker(runtimeRoot, version) {
  fs.writeFileSync(path.join(runtimeRoot, '.trim-python-version'), `${version}\n`, 'utf-8');
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

// ---- Windows (NuGet CPython) ----

function expandArchive(archivePath, destinationDir) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
  ], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Expand-Archive failed (exit ${result.status})`);
}

async function prepareWindows(vendorRoot) {
  const arch = WIN_ARCHS[process.arch];
  if (!arch) fail(`Unsupported Windows architecture: ${process.arch}`);

  const runtimeRoot = path.join(vendorRoot, arch.resourceDir);
  const pythonExe = path.join(runtimeRoot, 'tools', 'python.exe');

  if (fs.existsSync(pythonExe) && isCached(runtimeRoot, PYTHON_VERSION_WIN)) {
    log(`Using cached Python ${PYTHON_VERSION_WIN} from ${runtimeRoot}`);
    return;
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  ensureDir(runtimeRoot);

  const archivePath = path.join(vendorRoot, `${arch.resourceDir}.zip`);
  const url = `https://www.nuget.org/api/v2/package/${arch.packageId}/${PYTHON_VERSION_WIN}`;

  log(`Downloading Python ${PYTHON_VERSION_WIN} (${arch.packageId})...`);
  await downloadFile(url, archivePath);

  log(`Extracting to ${runtimeRoot}...`);
  expandArchive(archivePath, runtimeRoot);

  if (!fs.existsSync(pythonExe)) throw new Error(`python.exe not found at ${pythonExe}`);

  log('Bootstrapping pip...');
  const pip = spawnSync(pythonExe, ['-m', 'ensurepip', '--upgrade'], { stdio: 'inherit' });
  if (pip.status !== 0) throw new Error(`ensurepip failed (exit ${pip.status})`);

  writeMarker(runtimeRoot, PYTHON_VERSION_WIN);
  fs.rmSync(archivePath, { force: true });
  log(`Bundled Python ${PYTHON_VERSION_WIN} ready.`);
}

// ---- macOS (python-build-standalone from astral-sh) ----

function extractTarGz(archivePath, destinationDir) {
  ensureDir(destinationDir);
  const result = spawnSync('tar', ['xzf', archivePath, '-C', destinationDir, '--strip-components=1'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`tar extraction failed (exit ${result.status})`);
}

async function prepareMac(vendorRoot) {
  const arch = MAC_ARCHS[process.arch];
  if (!arch) fail(`Unsupported macOS architecture: ${process.arch}`);

  const runtimeRoot = path.join(vendorRoot, arch.resourceDir);
  const pythonBin = path.join(runtimeRoot, 'bin', 'python3');

  if (fs.existsSync(pythonBin) && isCached(runtimeRoot, PYTHON_VERSION_MAC)) {
    log(`Using cached Python ${PYTHON_VERSION_MAC} from ${runtimeRoot}`);
    return;
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  ensureDir(runtimeRoot);

  const filename = `cpython-${PYTHON_VERSION_MAC}+${PBS_RELEASE}-${arch.target}-install_only.tar.gz`;
  const archivePath = path.join(vendorRoot, filename);
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${filename}`;

  log(`Downloading Python ${PYTHON_VERSION_MAC} (${arch.target})...`);
  await downloadFile(url, archivePath);

  log(`Extracting to ${runtimeRoot}...`);
  extractTarGz(archivePath, runtimeRoot);

  if (!fs.existsSync(pythonBin)) throw new Error(`python3 not found at ${pythonBin}`);

  // install_only builds include pip; verify and fall back to ensurepip
  const pipCheck = spawnSync(pythonBin, ['-m', 'pip', '--version'], { stdio: 'pipe' });
  if (pipCheck.status !== 0) {
    log('pip missing, bootstrapping via ensurepip...');
    const ep = spawnSync(pythonBin, ['-m', 'ensurepip', '--upgrade'], { stdio: 'inherit' });
    if (ep.status !== 0) throw new Error(`ensurepip failed (exit ${ep.status})`);
  }

  writeMarker(runtimeRoot, PYTHON_VERSION_MAC);
  fs.rmSync(archivePath, { force: true });
  log(`Bundled Python ${PYTHON_VERSION_MAC} ready.`);
}

// ---- Entry point ----

async function main() {
  if (process.env.TRIM_SKIP_BUNDLED_PYTHON === '1') {
    log('Skipping (TRIM_SKIP_BUNDLED_PYTHON=1).');
    return;
  }

  const vendorRoot = path.join(__dirname, '..', 'vendor', 'python');
  ensureDir(vendorRoot);

  if (process.platform === 'win32') {
    await prepareWindows(vendorRoot);
  } else if (process.platform === 'darwin') {
    await prepareMac(vendorRoot);
  } else {
    log(`No bundled Python for platform "${process.platform}", skipping.`);
  }
}

main().catch((error) => {
  fail(error.message || String(error));
});