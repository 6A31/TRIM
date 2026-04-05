const { shell, nativeImage, safeStorage } = require('electron');
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { IPC, DEFAULTS } = require('../shared/constants');
const { createPlatformAdapter } = require('./platformAdapter');

let appCache = null;
const iconCache = new Map();
let ai = null; // GoogleGenAI client
let iconCacheDirty = false;
let iconCacheSaveTimer = null;
let usageData = {}; // { "app name lowercase": count }
const fileSearchCache = new Map(); // path -> metadata for cacheable file types only
let fileSearchCacheDirty = false;
let fileSearchCacheSaveTimer = null;
let folderSearchRequestSeq = 0;
const activeFolderRequests = new Map(); // webContentsId -> requestId
let platformAdapter = null;

// Common cacheable file types. Users can extend this from settings.
const DEFAULT_CACHEABLE_FILE_TYPES = new Set([
  '.txt', '.md', '.rtf', '.log', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.ini', '.xml',
  '.html', '.htm', '.css', '.scss', '.less', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.ipynb', '.java', '.kt', '.kts', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go', '.rs', '.php',
  '.rb', '.swift', '.m', '.mm', '.r', '.jl', '.sql', '.ps1', '.psm1', '.sh', '.bat', '.cmd', '.zsh', '.fish',
  '.gitignore', '.gitattributes', '.editorconfig', '.dockerfile', '.makefile', '.gradle', '.properties',
  '.pdf', '.doc', '.docx', '.odt', '.ppt', '.pptx', '.odp', '.xls', '.xlsx', '.ods', '.pages', '.numbers', '.key',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.ico', '.heic', '.avif', '.raw', '.psd',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.mp4', '.mkv', '.mov', '.avi', '.wmv', '.webm', '.m4v',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso',
  '.blend', '.fbx', '.obj', '.stl', '.step', '.stp', '.dwg', '.dxf', '.skp',
  '.sqlite', '.db', '.parquet', '.feather', '.h5', '.hdf5', '.pkl', '.joblib', '.onnx', '.pt', '.ckpt',
]);

function getCachePath(name) {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), name);
}

function getIconCachePath() { return getCachePath('icon-cache.json'); }
function getAppCachePath() { return getCachePath('app-cache.json'); }
function getUsageCachePath() { return getCachePath('usage-cache.json'); }
function getFileSearchCachePath() { return getCachePath('file-search-cache.json'); }

function safeFileSize(filePath) {
  try { return fs.statSync(filePath).size || 0; }
  catch { return 0; }
}

function loadIconCache() {
  try {
    const raw = fs.readFileSync(getIconCachePath(), 'utf-8');
    const data = JSON.parse(raw);
    for (const [k, v] of Object.entries(data)) {
      iconCache.set(k, v);
    }
  } catch {}
}

function saveIconCache() {
  if (!iconCacheDirty) return;
  iconCacheDirty = false;
  const obj = {};
  for (const [k, v] of iconCache) {
    if (v) obj[k] = v;
  }
  try { fs.writeFileSync(getIconCachePath(), JSON.stringify(obj)); } catch {}
}

function scheduleIconCacheSave() {
  iconCacheDirty = true;
  if (iconCacheSaveTimer) clearTimeout(iconCacheSaveTimer);
  iconCacheSaveTimer = setTimeout(saveIconCache, 2000);
}

function loadAppCache() {
  try {
    const raw = fs.readFileSync(getAppCachePath(), 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      appCache = data;
    }
  } catch {}
}

function saveAppCache() {
  if (!appCache || appCache.length === 0) return;
  try { fs.writeFileSync(getAppCachePath(), JSON.stringify(appCache)); } catch {}
}

function loadUsageData() {
  try {
    const raw = fs.readFileSync(getUsageCachePath(), 'utf-8');
    usageData = JSON.parse(raw) || {};
  } catch { usageData = {}; }
}

function saveUsageData() {
  try { fs.writeFileSync(getUsageCachePath(), JSON.stringify(usageData)); } catch {}
}

function normalizeFileExt(name) {
  const ext = path.extname(name || '').toLowerCase();
  return ext || '';
}

function getCacheableExtensions(settings) {
  const merged = new Set(DEFAULT_CACHEABLE_FILE_TYPES);
  const extra = Array.isArray(settings?.cachedFileTypes) ? settings.cachedFileTypes : [];
  for (const item of extra) {
    if (!item || typeof item !== 'string') continue;
    const ext = item.trim().toLowerCase();
    if (!ext) continue;
    merged.add(ext.startsWith('.') ? ext : `.${ext}`);
  }
  return merged;
}

function shouldCacheFileEntry(entry, settings) {
  if (!entry || entry.isDirectory) return false;
  const allowed = getCacheableExtensions(settings);
  const ext = normalizeFileExt(entry.name);
  return ext && allowed.has(ext);
}

function loadFileSearchCache() {
  try {
    const raw = fs.readFileSync(getFileSearchCachePath(), 'utf-8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || !item.path || !item.name || !item.ext) continue;
      fileSearchCache.set(item.path, {
        path: item.path,
        name: item.name,
        ext: item.ext,
        parent: item.parent || '',
        isDirectory: false,
        cachedAt: item.cachedAt || Date.now(),
        lastSeenAt: item.lastSeenAt || Date.now(),
        minDepth: Number.isInteger(item.minDepth) ? item.minDepth : 99,
      });
    }
  } catch {}
}

function scheduleFileSearchCacheSave() {
  fileSearchCacheDirty = true;
  if (fileSearchCacheSaveTimer) clearTimeout(fileSearchCacheSaveTimer);
  fileSearchCacheSaveTimer = setTimeout(() => {
    if (!fileSearchCacheDirty) return;
    fileSearchCacheDirty = false;
    try {
      const serializable = [...fileSearchCache.values()].map(v => ({
        path: v.path,
        name: v.name,
        ext: v.ext,
        parent: v.parent,
        cachedAt: v.cachedAt,
        lastSeenAt: v.lastSeenAt,
        minDepth: v.minDepth,
      }));
      fs.writeFileSync(getFileSearchCachePath(), JSON.stringify(serializable));
    } catch {}
  }, 2000);
}

function upsertFileSearchCache(entry, depth, settings) {
  if (!shouldCacheFileEntry(entry, settings)) return;
  const now = Date.now();
  const existing = fileSearchCache.get(entry.path);
  if (existing) {
    existing.name = entry.name;
    existing.parent = path.dirname(entry.path);
    existing.lastSeenAt = now;
    existing.minDepth = Math.min(existing.minDepth, depth);
  } else {
    fileSearchCache.set(entry.path, {
      path: entry.path,
      name: entry.name,
      ext: normalizeFileExt(entry.name),
      parent: path.dirname(entry.path),
      isDirectory: false,
      cachedAt: now,
      lastSeenAt: now,
      minDepth: depth,
    });
  }
  scheduleFileSearchCacheSave();
}

function recordAppLaunch(appName) {
  const key = appName.toLowerCase();
  usageData[key] = (usageData[key] || 0) + 1;
  saveUsageData();
}

function getUsageCount(appName) {
  return usageData[appName.toLowerCase()] || 0;
}

function getScriptsPath() {
  const devPath = path.join(__dirname, '..', '..', 'scripts');
  if (fs.existsSync(devPath)) return devPath;
  return path.join(process.resourcesPath, 'scripts');
}

function runPowerShell(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${script.replace(/'/g, "''")}' ${args.map(a => `'${a.replace(/'/g, "''")}'`).join(' ')}`,
    ], { maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function getSettingsPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettingsSync() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const settings = { ...DEFAULTS, ...JSON.parse(raw) };
    // Decrypt API key if stored encrypted
    if (settings.apiKeyEncrypted && !settings.apiKey) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const buf = Buffer.from(settings.apiKeyEncrypted, 'base64');
          settings.apiKey = safeStorage.decryptString(buf);
        }
      } catch {}
    }
    delete settings.apiKeyEncrypted;
    return settings;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettingsWithEncryption(settings) {
  const toWrite = { ...settings };
  // Encrypt API key before writing to disk
  if (toWrite.apiKey) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        toWrite.apiKeyEncrypted = safeStorage.encryptString(toWrite.apiKey).toString('base64');
        delete toWrite.apiKey;
      }
    } catch {}
  }
  fs.writeFileSync(getSettingsPath(), JSON.stringify(toWrite, null, 2));
}

// --- Python execution ---

const PYTHON_TOOL = {
  name: 'run_python',
  description: 'Execute a Python code snippet. Use for calculations, data processing, plotting charts, or any task that benefits from code execution. You can install pip packages first. For plots, use matplotlib and ALWAYS save to the path in the PLOT_PATH variable with plt.savefig(PLOT_PATH) - it will be displayed to the user automatically. NEVER save plots to any other filename or reference images in your response text - only use PLOT_PATH. Set show_output to true if the user should see the code and its output, false if you just need the result internally.',
  parameters: {
    type: 'OBJECT',
    properties: {
      code: { type: 'STRING', description: 'Python code to execute' },
      packages: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Pip packages to install before running (e.g. ["numpy", "matplotlib"])',
      },
      show_output: { type: 'BOOLEAN', description: 'Whether to show code + output to the user' },
    },
    required: ['code'],
  },
};

const READ_FILE_TOOL = {
  name: 'read_file',
  description: 'Read the contents of a file at an absolute path. Returns the text content. Use for inspecting files the user asks about.',
  parameters: {
    type: 'OBJECT',
    properties: {
      path: { type: 'STRING', description: 'Absolute file path to read' },
    },
    required: ['path'],
  },
};

const WRITE_FILE_TOOL = {
  name: 'write_file',
  description: 'Create or overwrite a file with the given content. Requires user confirmation before execution. Always use absolute paths.',
  parameters: {
    type: 'OBJECT',
    properties: {
      path: { type: 'STRING', description: 'Absolute file path to write' },
      content: { type: 'STRING', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },
};

const EDIT_FILE_TOOL = {
  name: 'edit_file',
  description: 'Find and replace text in an existing file. Replaces the first occurrence of old_text with new_text. Requires user confirmation.',
  parameters: {
    type: 'OBJECT',
    properties: {
      path: { type: 'STRING', description: 'Absolute file path to edit' },
      old_text: { type: 'STRING', description: 'Exact text to find in the file' },
      new_text: { type: 'STRING', description: 'Text to replace it with' },
    },
    required: ['path', 'old_text', 'new_text'],
  },
};

const DELETE_FILE_TOOL = {
  name: 'delete_file',
  description: 'Delete a file or folder. Requires user confirmation. Folders are deleted recursively.',
  parameters: {
    type: 'OBJECT',
    properties: {
      path: { type: 'STRING', description: 'Absolute path to file or folder to delete' },
    },
    required: ['path'],
  },
};

const LIST_DIRECTORY_TOOL = {
  name: 'list_directory',
  description: 'List the contents of a directory. Returns names, sizes, and types (file/directory) for each entry. Use to explore the filesystem.',
  parameters: {
    type: 'OBJECT',
    properties: {
      path: { type: 'STRING', description: 'Absolute directory path to list' },
    },
    required: ['path'],
  },
};

function findPython() {
  const candidates = ['python', 'python3', 'py'];
  for (const cmd of candidates) {
    try {
      const result = execFileSync(cmd, ['--version'], { stdio: 'pipe', timeout: 5000 }).toString().trim();
      if (result.startsWith('Python 3')) return cmd;
    } catch {}
  }
  return null;
}

let pythonCmd = null;

// All Python execution uses a temp venv — no global pip installs.
function needsVenv(packages) {
  return packages && packages.length > 0;
}

function cleanupOrphanedTempDirs() {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    for (const e of entries) {
      if (e.startsWith('trim-py-')) {
        try { fs.rmSync(path.join(tmpDir, e), { recursive: true, force: true }); } catch {}
      }
    }
  } catch {}
}

function createTempVenv() {
  if (!pythonCmd) pythonCmd = findPython();
  if (!pythonCmd) return null;

  const venvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-py-venv-'));
  const venvPy = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  try {
    execFileSync(pythonCmd, ['-m', 'venv', venvDir], { stdio: 'pipe', timeout: 30000 });
  } catch {
    try { fs.rmSync(venvDir, { recursive: true, force: true }); } catch {}
    return null;
  }

  return { dir: venvDir, python: venvPy };
}

function cleanupVenv(venv) {
  if (!venv) return;
  try { fs.rmSync(venv.dir, { recursive: true, force: true }); } catch {}
}

function runPythonCode(py, code, packages, plotPath) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-py-'));
    const scriptPath = path.join(tmpDir, 'script.py');

    // Install packages (into venv or global depending on caller)
    if (packages && packages.length > 0) {
      try {
        const safePackageRe = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\[.*\])?$/;
        for (const pkg of packages) {
          if (!safePackageRe.test(pkg)) {
            resolve({ error: `Invalid package name: ${pkg}` });
            return;
          }
        }
        execFileSync(py, ['-m', 'pip', 'install', ...packages, '--quiet'], {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err) {
        resolve({ error: `Failed to install packages: ${err.message}` });
        return;
      }
    }

    // Prepend plot path + matplotlib config
    const preamble = `import os
PLOT_PATH = ${JSON.stringify(plotPath)}
os.environ['PLOT_PATH'] = PLOT_PATH
try:
    import matplotlib
    matplotlib.use('Agg')
except ImportError:
    pass
`;

    fs.writeFileSync(scriptPath, preamble + code, 'utf-8');

    execFile(py, [scriptPath], {
      cwd: tmpDir,
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      let plot = null;
      if (fs.existsSync(plotPath)) {
        const buf = fs.readFileSync(plotPath);
        plot = `data:image/png;base64,${buf.toString('base64')}`;
      }

      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      try { if (fs.existsSync(plotPath)) fs.unlinkSync(plotPath); } catch {}

      if (err && !stdout && !stderr) {
        resolve({ error: err.message, plot });
      } else {
        const output = (stdout || '').trim();
        const errOutput = (stderr || '').trim();
        resolve({
          stdout: output,
          error: errOutput || (err ? err.message : null),
          plot,
        });
      }
    });
  });
}

// --- File operation helpers ---

// Deny access to sensitive system paths from AI tool calls.
const SENSITIVE_PATTERNS_WIN = [
  /[\\/]windows[\\/]system32[\\/]config/i,
  /[\\/]\.ssh[\\/]/i,
  /[\\/]\.gnupg[\\/]/i,
  /[\\/]\.aws[\\/]/i,
  /[\\/]\.azure[\\/]/i,
  /[\\/]\.gcloud[\\/]/i,
  /[\\/]\.docker[\\/]/i,
  /[\\/]\.kube[\\/]/i,
  /[\\/]credential/i,
  /[\\/]\.env$/i,
  /[\\/]\.env\./i,
  /[\\/]\.npmrc$/i,
  /[\\/]\.netrc$/i,
  /[\\/]\.pgpass$/i,
];

const SENSITIVE_PATTERNS_UNIX = [
  /^\/etc\/shadow/i,
  /^\/etc\/passwd/i,
  /^\/etc\/sudoers/i,
  /[\\/]\.ssh[\\/]/i,
  /[\\/]\.gnupg[\\/]/i,
  /[\\/]\.aws[\\/]/i,
  /[\\/]\.azure[\\/]/i,
  /[\\/]\.gcloud[\\/]/i,
  /[\\/]\.docker[\\/]/i,
  /[\\/]\.kube[\\/]/i,
  /[\\/]credential/i,
  /[\\/]\.env$/i,
  /[\\/]\.env\./i,
  /[\\/]\.npmrc$/i,
  /[\\/]\.netrc$/i,
  /[\\/]\.pgpass$/i,
];

function isPathBlocked(filePath) {
  const resolved = path.resolve(filePath);
  const patterns = process.platform === 'win32' ? SENSITIVE_PATTERNS_WIN : SENSITIVE_PATTERNS_UNIX;
  return patterns.some(re => re.test(resolved));
}

function executeReadFile(filePath) {
  if (isPathBlocked(filePath)) {
    return { error: 'Access denied: this path is restricted for security.' };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const truncated = content.length > 50000;
    return { content: truncated ? content.slice(0, 50000) + '\n... [truncated]' : content };
  } catch (err) {
    return { error: err.message };
  }
}

function executeWriteFile(filePath, content) {
  if (isPathBlocked(filePath)) {
    return { error: 'Access denied: this path is restricted for security.' };
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content) };
  } catch (err) {
    return { error: err.message };
  }
}

function executeEditFile(filePath, oldText, newText) {
  if (isPathBlocked(filePath)) {
    return { error: 'Access denied: this path is restricted for security.' };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(oldText)) {
      return { error: 'old_text not found in file' };
    }
    const updated = content.replace(oldText, newText);
    fs.writeFileSync(filePath, updated, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { error: err.message };
  }
}

function executeDeleteFile(filePath) {
  if (isPathBlocked(filePath)) {
    return { error: 'Access denied: this path is restricted for security.' };
  }
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return { success: true, path: filePath };
  } catch (err) {
    return { error: err.message };
  }
}

function executeListDirectory(dirPath) {
  if (isPathBlocked(dirPath)) {
    return { error: 'Access denied: this path is restricted for security.' };
  }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.slice(0, 100).map(e => {
      const fullPath = path.join(dirPath, e.name);
      let size = null;
      try {
        if (!e.isDirectory()) size = fs.statSync(fullPath).size;
      } catch {}
      return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size };
    });
    return { path: dirPath, entries: items, total: entries.length };
  } catch (err) {
    return { error: err.message };
  }
}

const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'delete_file']);

let ipcMainRef = null;

function requestConfirmation(event, details) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ipcMainRef.removeAllListeners(IPC.CONFIRM_ACTION_RESPONSE);
      resolve(false);
    }, 60000);

    ipcMainRef.once(IPC.CONFIRM_ACTION_RESPONSE, (_e, approved) => {
      clearTimeout(timeout);
      resolve(approved);
    });

    event.sender.send(IPC.CONFIRM_ACTION, details);
  });
}

// --- AI init ---

const SYSTEM_INSTRUCTION = `You are a concise assistant inside a desktop launcher called Trim. Give short, direct answers - a few sentences max. Include all key facts but skip filler, introductions, and unnecessary detail. Use bullet points for lists. Never repeat the question.

You have access to these tools:

**run_python** - Execute Python code locally for computation, data processing, plotting:
- Save plots to PLOT_PATH using plt.savefig(PLOT_PATH) - shown automatically
- NEVER save plots to other paths or reference images in text (no ![](...)  links)
- NEVER use Python for file system operations - use the dedicated file tools below
- Set show_output=true when user should see code/result, false for intermediate calculations

**File tools** - For interacting with the user's file system:
- read_file(path) - Read file contents (no confirmation needed)
- write_file(path, content) - Create or overwrite a file (requires user approval)
- edit_file(path, old_text, new_text) - Find-and-replace in a file (requires user approval)
- delete_file(path) - Delete a file or folder (requires user approval)
- list_directory(path) - List directory contents (no confirmation needed)

Always use absolute paths for file tools. The user will approve write/edit/delete before execution.

**googleSearch** - Search the web for current information.`;

function getSystemInstruction(forceShowOutput) {
  const osName = platformAdapter ? platformAdapter.getOSLabel() : (process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux');
  const osLine = `\n\nEnvironment context:\n- Current operating system: ${osName}. Prefer OS-appropriate commands and paths.`;
  return forceShowOutput
    ? SYSTEM_INSTRUCTION + osLine + FORCE_CODE_ADDENDUM
    : SYSTEM_INSTRUCTION + osLine;
}

const FORCE_CODE_ADDENDUM = `\n\nIMPORTANT - Force Code mode is ON:
- Use Python code execution for ALL calculations, math, logic, comparisons, data lookups, and any verifiable task.
- Do NOT rely on LLM reasoning for math or numbers - always write and run code to get deterministic, correct results.
- Always set show_output=true so the user sees the code and its output.
- Only skip code if the question is purely conversational with no computable component.`;

const AI_TOOLS = [
  { googleSearch: {} },
  { functionDeclarations: [
    PYTHON_TOOL,
    READ_FILE_TOOL,
    WRITE_FILE_TOOL,
    EDIT_FILE_TOOL,
    DELETE_FILE_TOOL,
    LIST_DIRECTORY_TOOL,
  ] },
];

function initAI(apiKey) {
  if (!apiKey) { ai = null; return; }
  const { GoogleGenAI } = require('@google/genai');
  ai = new GoogleGenAI({ apiKey });
}

// --- Send status to renderer ---

function sendStatus(event, text) {
  try {
    event.sender.send(IPC.AI_STATUS, { text });
  } catch {}
}

// --- AI query with function calling loop ---

let chatHistory = null; // { contents: [], model: string }

// Resolve #filepath references in query - read files and build multi-part content
function resolveFileReferences(query) {
  // Match #"C:\path with spaces\file.png" or #C:\path\file.png or #/unix/path
  const fileRefRegex = /#(?:"([^"]+)"|([A-Za-z]:[\\\/][^\s#]+|\/[^\s#]+))/g;
  const files = [];
  let match;
  while ((match = fileRefRegex.exec(query)) !== null) {
    const filePath = match[1] || match[2];
    if (!filePath) continue;
    files.push({ ref: match[0], filePath });
  }
  if (files.length === 0) return { text: query, extraParts: [] };

  let processedText = query;
  const extraParts = [];

  for (const file of files) {
    if (isPathBlocked(file.filePath)) {
      processedText = processedText.replace(file.ref, `[Access denied: ${path.basename(file.filePath)}]`);
      continue;
    }
    const ext = path.extname(file.filePath).toLowerCase();
    try {
      const MAX_BINARY_SIZE = 20 * 1024 * 1024; // 20 MB
      if (ext === '.pdf') {
        const stat = fs.statSync(file.filePath);
        if (stat.size > MAX_BINARY_SIZE) {
          processedText = processedText.replace(file.ref, `[File too large: ${path.basename(file.filePath)} (${Math.round(stat.size / 1024 / 1024)}MB, limit 20MB)]`);
          continue;
        }
        const buf = fs.readFileSync(file.filePath);
        extraParts.push({
          inlineData: { mimeType: 'application/pdf', data: buf.toString('base64') },
        });
        processedText = processedText.replace(file.ref, `[Attached: ${path.basename(file.filePath)}]`);
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
        const stat = fs.statSync(file.filePath);
        if (stat.size > MAX_BINARY_SIZE) {
          processedText = processedText.replace(file.ref, `[File too large: ${path.basename(file.filePath)} (${Math.round(stat.size / 1024 / 1024)}MB, limit 20MB)]`);
          continue;
        }
        const buf = fs.readFileSync(file.filePath);
        const mime = `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;
        extraParts.push({
          inlineData: { mimeType: mime, data: buf.toString('base64') },
        });
        processedText = processedText.replace(file.ref, `[Attached image: ${path.basename(file.filePath)}]`);
      } else {
        // Text file - inline contents
        const content = fs.readFileSync(file.filePath, 'utf-8');
        processedText = processedText.replace(file.ref, `[File: ${path.basename(file.filePath)}]`);
        processedText += `\n\n--- Contents of ${file.filePath} ---\n${content.slice(0, 50000)}\n--- End of file ---`;
      }
    } catch (err) {
      processedText = processedText.replace(file.ref, `[File not found: ${file.filePath}]`);
    }
  }

  return { text: processedText, extraParts };
}

let activeQueryId = 0;

async function handleAIQuery(event, query, usePro, forceShowOutput, followUp) {
  const queryId = ++activeQueryId;

  if (!ai) {
    return { error: 'No API key configured. Use /settings to add your Gemini API key.' };
  }

  const settings = loadSettingsSync();
  const modelName = usePro
    ? (settings.modelPro || 'gemini-3.1-pro-preview')
    : (settings.model || 'gemini-3-flash-preview');

  sendStatus(event, usePro ? 'Asking Gemini Pro...' : 'Asking Gemini...');

  let venv = null;

  try {
    // Resolve #file references in the query
    const { text: resolvedQuery, extraParts } = resolveFileReferences(query);

    // Build contents: continue existing conversation or start fresh
    const userParts = [{ text: resolvedQuery }, ...extraParts];
    let contents;
    if (followUp && chatHistory && chatHistory.model === modelName) {
      contents = [...chatHistory.contents, { role: 'user', parts: userParts }];
    } else {
      contents = [{ role: 'user', parts: userParts }];
    }

    // Conditionally add force-code instruction
    const sysInstruction = getSystemInstruction(forceShowOutput);

    const codeOutputs = [];
    const MAX_ROUNDS = 6;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Bail out if a newer query has started
      if (queryId !== activeQueryId) {
        return { error: '__aborted__' };
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          tools: AI_TOOLS,
          systemInstruction: sysInstruction,
          toolConfig: {
            includeServerSideToolInvocations: true,
          },
        },
      });

      const candidate = response.candidates?.[0];
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        // Append model turn to history
        contents.push(candidate.content);

        const responseParts = [];
        for (const fc of functionCalls) {
          if (fc.name === 'run_python') {
            const code = fc.args?.code || '';
            const packages = fc.args?.packages || [];
            const showOutput = forceShowOutput || fc.args?.show_output !== false;

            // Decide: use global Python (fast) or temp venv (exotic packages)
            let py;
            if (needsVenv(packages)) {
              if (!venv) {
                sendStatus(event, 'Setting up Python environment...');
                venv = createTempVenv();
                if (!venv) {
                  responseParts.push({
                    functionResponse: {
                      name: 'run_python',
                      response: { result: { error: 'Python 3 not found.' } },
                      id: fc.id,
                    },
                  });
                  continue;
                }
              }
              py = venv.python;
              if (packages.length > 0) {
                sendStatus(event, `Installing ${packages.join(', ')}...`);
              }
            } else {
              if (!pythonCmd) pythonCmd = findPython();
              if (!pythonCmd) {
                responseParts.push({
                  functionResponse: {
                    name: 'run_python',
                    response: { result: { error: 'Python 3 not found.' } },
                    id: fc.id,
                  },
                });
                continue;
              }
              py = pythonCmd;
            }

            sendStatus(event, 'Running Python code...');

            const plotPath = path.join(os.tmpdir(), `trim-plot-${Date.now()}.png`);
            const pyResult = await runPythonCode(py, code, packages, plotPath);

            if (showOutput) {
              codeOutputs.push({
                code,
                stdout: pyResult.stdout || null,
                error: pyResult.error || null,
                plot: pyResult.plot || null,
              });
            }

            sendStatus(event, 'Analyzing results...');

            responseParts.push({
              functionResponse: {
                name: 'run_python',
                response: {
                  result: {
                    stdout: pyResult.stdout || '',
                    error: pyResult.error || '',
                    has_plot: !!pyResult.plot,
                  },
                },
                id: fc.id,
              },
            });
          } else if (fc.name === 'read_file') {
            sendStatus(event, 'Reading file...');
            const result = executeReadFile(fc.args.path);
            responseParts.push({
              functionResponse: { name: 'read_file', response: { result }, id: fc.id },
            });
          } else if (fc.name === 'list_directory') {
            sendStatus(event, 'Listing directory...');
            const result = executeListDirectory(fc.args.path);
            responseParts.push({
              functionResponse: { name: 'list_directory', response: { result }, id: fc.id },
            });
          } else if (MUTATING_TOOLS.has(fc.name)) {
            // Build confirmation details
            const details = { tool: fc.name, path: fc.args.path };
            if (fc.name === 'write_file') {
              const content = fc.args.content || '';
              details.contentPreview = content.slice(0, 500);
              details.contentLength = content.length;
            } else if (fc.name === 'edit_file') {
              details.oldText = (fc.args.old_text || '').slice(0, 300);
              details.newText = (fc.args.new_text || '').slice(0, 300);
            } else if (fc.name === 'delete_file') {
              try { details.isDirectory = fs.statSync(fc.args.path).isDirectory(); }
              catch { details.isDirectory = false; }
            }

            sendStatus(event, 'Waiting for approval...');
            const approved = await requestConfirmation(event, details);

            let result;
            if (approved) {
              sendStatus(event, `Executing ${fc.name.replace(/_/g, ' ')}...`);
              if (fc.name === 'write_file') {
                result = executeWriteFile(fc.args.path, fc.args.content || '');
              } else if (fc.name === 'edit_file') {
                result = executeEditFile(fc.args.path, fc.args.old_text, fc.args.new_text);
              } else if (fc.name === 'delete_file') {
                result = executeDeleteFile(fc.args.path);
              }
            } else {
              result = { error: 'User denied this operation.' };
            }

            sendStatus(event, 'Analyzing results...');
            responseParts.push({
              functionResponse: { name: fc.name, response: { result }, id: fc.id },
            });
          }
        }

        // Send function responses back
        contents.push({ role: 'user', parts: responseParts });
      } else {
        // Final text response
        const text = response.text || '';
        const grounding = candidate?.groundingMetadata;
        const sources = grounding?.groundingChunks
          ?.filter(c => c.web)
          .map(c => ({ title: c.web.title, uri: c.web.uri })) || [];

        // Save conversation history for follow-ups
        contents.push(candidate.content);
        chatHistory = { contents, model: modelName };

        return { text, sources, codeOutputs };
      }
    }

    // Fallback after max rounds
    return { text: 'Reached maximum processing rounds.', sources: [], codeOutputs };
  } catch (err) {
    return { error: friendlyError(err) };
  } finally {
    // Always clean up venv after query completes
    cleanupVenv(venv);
  }
}

function friendlyError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('enetunreach') || msg.includes('etimedout'))
    return 'No internet connection - check your network and try again.';
  if (msg.includes('api key') || msg.includes('401') || msg.includes('403'))
    return 'Invalid API key. Check your key in /settings.';
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
    return 'Rate limited - wait a moment and try again.';
  if (msg.includes('500') || msg.includes('503') || msg.includes('unavailable'))
    return 'Gemini is temporarily unavailable. Try again shortly.';
  return err.message || 'Something went wrong.';
}

function normalizePathKey(p) {
  return path.resolve(p).toLowerCase();
}

function computeFileSearchScore(entry, queryLower, depthHint = 99) {
  const name = (entry.name || '').toLowerCase();
  const fullPath = (entry.path || '').toLowerCase();
  let score = 0;

  if (name === queryLower) score = 1200;
  else if (name.startsWith(queryLower)) score = 1000;
  else if (name.includes(queryLower)) score = 780;
  else if (fullPath.includes(queryLower)) score = 520;
  else return 0;

  if (entry.isDirectory) score += 60;
  const depthBonus = Math.max(0, 140 - (depthHint * 20));
  score += depthBonus;

  return score;
}

function rankAndTrim(candidateMap, limit = 20) {
  return [...candidateMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(v => v.entry);
}

function addOrUpgradeCandidate(candidateMap, entry, score) {
  if (score <= 0) return false;
  const key = normalizePathKey(entry.path);
  const existing = candidateMap.get(key);
  if (!existing || score > existing.score) {
    candidateMap.set(key, { entry, score });
    return true;
  }
  return false;
}

function createEntry(name, fullPath, isDirectory) {
  return { name, path: fullPath, isDirectory: !!isDirectory };
}

function collectFromCache(queryLower, settings, candidateMap) {
  for (const cached of fileSearchCache.values()) {
    const entry = createEntry(cached.name, cached.path, false);
    const score = computeFileSearchScore(entry, queryLower, cached.minDepth || 99);
    if (score > 0) addOrUpgradeCandidate(candidateMap, entry, score + 80);
  }
}

function quickExistenceCheck(entries, candidateMap, sender, requestId, query) {
  const targets = entries.filter(e => !e.isDirectory).map(e => e.path);
  if (targets.length === 0) return;

  let idx = 0;
  const missing = [];

  const tick = () => {
    const BATCH = 16;
    const end = Math.min(idx + BATCH, targets.length);
    for (; idx < end; idx++) {
      const p = targets[idx];
      if (!fs.existsSync(p)) missing.push(p);
    }

    if (idx < targets.length) {
      setImmediate(tick);
      return;
    }

    if (missing.length === 0) return;

    let changed = false;
    for (const p of missing) {
      const key = normalizePathKey(p);
      if (candidateMap.delete(key)) changed = true;
      if (fileSearchCache.delete(p)) changed = true;
    }
    if (changed) {
      scheduleFileSearchCacheSave();
      const active = activeFolderRequests.get(sender.id);
      if (active === requestId && !sender.isDestroyed()) {
        sender.send(IPC.SEARCH_FOLDERS_UPDATE, {
          requestId,
          query,
          results: rankAndTrim(candidateMap, 20),
        });
      }
    }
  };

  setImmediate(tick);
}

function collectShallowMatches(queryLower, roots, candidateMap, settings) {
  const MAX_DIRS = 180;
  const MAX_DEPTH = 1;
  const queue = roots
    .filter(r => fs.existsSync(r))
    .map(r => ({ dir: r, depth: 0 }));

  let visited = 0;
  while (queue.length > 0 && visited < MAX_DIRS) {
    const { dir, depth } = queue.shift();
    visited += 1;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }

    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fullPath = path.join(dir, e.name);
      const entry = createEntry(e.name, fullPath, e.isDirectory());
      const score = computeFileSearchScore(entry, queryLower, depth);
      if (score > 0) addOrUpgradeCandidate(candidateMap, entry, score);
      if (!e.isDirectory()) upsertFileSearchCache(entry, depth, settings);
      if (e.isDirectory() && depth < MAX_DEPTH) {
        queue.push({ dir: fullPath, depth: depth + 1 });
      }
    }
  }
}

function streamDeepMatches(queryLower, roots, candidateMap, settings, sender, requestId, query) {
  const MAX_DEPTH = 5;
  const BATCH_DIRS = 18;
  const queue = roots
    .filter(r => fs.existsSync(r))
    .map(r => ({ dir: r, depth: 0 }));

  let scanned = 0;
  let changedSinceLastEmit = false;
  let emitCounter = 0;
  let lastFingerprint = rankAndTrim(candidateMap, 20).map(v => v.path).join('|');

  const emitIfChanged = () => {
    const top = rankAndTrim(candidateMap, 20);
    const fingerprint = top.map(v => v.path).join('|');
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    if (!sender.isDestroyed()) {
      sender.send(IPC.SEARCH_FOLDERS_UPDATE, { requestId, query, results: top });
    }
  };

  const tick = () => {
    const active = activeFolderRequests.get(sender.id);
    if (active !== requestId || sender.isDestroyed()) return;

    let processed = 0;
    while (queue.length > 0 && processed < BATCH_DIRS) {
      const { dir, depth } = queue.shift();
      processed += 1;
      scanned += 1;

      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch { continue; }

      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const fullPath = path.join(dir, e.name);
        const entry = createEntry(e.name, fullPath, e.isDirectory());
        const score = computeFileSearchScore(entry, queryLower, depth);
        if (score > 0 && addOrUpgradeCandidate(candidateMap, entry, score)) {
          changedSinceLastEmit = true;
        }
        if (!e.isDirectory()) upsertFileSearchCache(entry, depth, settings);
        if (e.isDirectory() && depth < MAX_DEPTH) {
          queue.push({ dir: fullPath, depth: depth + 1 });
        }
      }
    }

    emitCounter += 1;
    if (changedSinceLastEmit && (emitCounter % 4 === 0 || queue.length === 0)) {
      changedSinceLastEmit = false;
      emitIfChanged();
    }

    // Hard stop keeps deep scan bounded while still materially improving results.
    if (queue.length === 0 || scanned > 1600) {
      emitIfChanged();
      return;
    }

    setImmediate(tick);
  };

  setImmediate(tick);
}

// --- Register all IPC handlers ---

function registerHandlers(ipcMain) {
  ipcMainRef = ipcMain;
  platformAdapter = createPlatformAdapter({
    fs,
    path,
    os,
    shell,
    nativeImage,
    runPowerShell,
    getScriptsPath,
  });

  const settings = loadSettingsSync();
  if (settings.apiKey) initAI(settings.apiKey);

  // Load persistent caches
  loadIconCache();
  loadAppCache();
  loadUsageData();
  loadFileSearchCache();

  // Clean up any orphaned temp dirs from previous crashes
  cleanupOrphanedTempDirs();

  // Background-refresh app list (serves cached data instantly, updates in background)
  function refreshAppList() {
    platformAdapter.listApps().then(fresh => {
      if (Array.isArray(fresh) && fresh.length > 0) {
        appCache = fresh;
        saveAppCache();
      }
    }).catch(() => {});
  }
  setImmediate(refreshAppList);

  ipcMain.handle(IPC.SEARCH_APPS, async () => {
    if (appCache) return appCache;
    try {
      appCache = await platformAdapter.listApps();
      saveAppCache();
    } catch {
      appCache = [];
    }
    return appCache;
  });

  ipcMain.handle(IPC.GET_USAGE, async () => {
    return usageData;
  });

  ipcMain.handle(IPC.GET_ICON, async (_e, filePath) => {
    if (iconCache.has(filePath)) return iconCache.get(filePath);

    // Image files (UWP icons) - read directly
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.bmp', '.ico', '.webp', '.gif', '.icns'].includes(ext)) {
      try {
        const buf = fs.readFileSync(filePath);
        const mime = ext === '.ico' ? 'image/x-icon'
          : ext === '.bmp' ? 'image/bmp'
            : ext === '.icns' ? 'image/icns'
              : `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;
        const dataUri = platformAdapter.toDataUriFromBuffer(buf, mime);
        iconCache.set(filePath, dataUri);
        scheduleIconCacheSave();
        return dataUri;
      } catch {
        iconCache.set(filePath, null);
        return null;
      }
    }

    try {
      const dataUri = await platformAdapter.getPlatformIconDataUri(filePath);
      iconCache.set(filePath, dataUri);
      if (dataUri) scheduleIconCacheSave();
      return dataUri;
    } catch {
      iconCache.set(filePath, null);
      return null;
    }
  });

  ipcMain.handle(IPC.OPEN_APP, async (_e, appPath, appName) => {
    try {
      if (appName) recordAppLaunch(appName);
      await platformAdapter.openApp(appPath);
    } catch (err) {
      console.error('Failed to open app:', err);
    }
  });

  ipcMain.handle(IPC.AI_QUERY, async (event, query, usePro, forceShowOutput, followUp) => {
    return handleAIQuery(event, query, usePro, forceShowOutput, followUp);
  });

  ipcMain.handle(IPC.SEARCH_FOLDERS, async (_e, query) => {
    try {
      const sender = _e.sender;
      const requestId = ++folderSearchRequestSeq;
      activeFolderRequests.set(sender.id, requestId);

      const cleanQuery = (query || '').trim();
      if (!cleanQuery) {
        return { requestId, results: [] };
      }

      const settings = loadSettingsSync();
      const queryLower = cleanQuery.toLowerCase();
      const hasPathSep = cleanQuery.includes('/') || cleanQuery.includes('\\');
      const hasDrive = /^[a-zA-Z]:/.test(cleanQuery);

      if (hasPathSep || hasDrive) {
        // Direct path mode: list specific directory
        const searchPath = hasDrive ? cleanQuery : path.join(os.homedir(), cleanQuery);
        const dir = path.dirname(searchPath);
        const pattern = path.basename(searchPath).toLowerCase();

        if (!fs.existsSync(dir)) return { requestId, results: [] };

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const results = entries
          .filter(e => e.name.toLowerCase().includes(pattern || ''))
          .slice(0, 20)
          .map(e => ({
            name: e.name,
            path: path.join(dir, e.name),
            isDirectory: e.isDirectory(),
          }));

        for (const entry of results) upsertFileSearchCache(entry, 0, settings);
        return { requestId, results };
      }

      // Recursive search mode: search common locations
      const pattern = queryLower;
      if (!pattern) return { requestId, results: [] };

      const roots = platformAdapter.getSearchRoots(settings);

      const seen = new Set();
      const uniqueRoots = roots.filter(r => {
        const norm = path.resolve(r).toLowerCase();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });

      const candidates = new Map();
      collectFromCache(pattern, settings, candidates);
      collectShallowMatches(pattern, uniqueRoots, candidates, settings);

      const initialResults = rankAndTrim(candidates, 20);
      quickExistenceCheck(initialResults, candidates, sender, requestId, cleanQuery);
      streamDeepMatches(pattern, uniqueRoots, candidates, settings, sender, requestId, cleanQuery);

      return { requestId, results: initialResults };
    } catch {
      return { requestId: ++folderSearchRequestSeq, results: [] };
    }
  });

  ipcMain.handle(IPC.OPEN_FOLDER, async (_e, folderPath) => {
    // Only open actual directories — refuse files to prevent executing binaries.
    try {
      const stat = fs.statSync(folderPath);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }
    shell.openPath(folderPath);
  });

  ipcMain.handle(IPC.LOAD_SETTINGS, async () => {
    return loadSettingsSync();
  });

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_e, data) => {
    const current = loadSettingsSync();
    const merged = { ...current, ...data };
    if (Array.isArray(merged.cachedFileTypes)) {
      merged.cachedFileTypes = merged.cachedFileTypes
        .map(v => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .filter(Boolean)
        .map(v => (v.startsWith('.') ? v : `.${v}`))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 200);
    } else {
      merged.cachedFileTypes = [];
    }
    saveSettingsWithEncryption(merged);
    if (data.apiKey !== undefined) initAI(data.apiKey);
    appCache = null;
    return merged;
  });

  ipcMain.handle(IPC.CLEANUP, async () => {
    chatHistory = null;
    cleanupOrphanedTempDirs();
    return true;
  });

  ipcMain.handle(IPC.GET_CACHE_SIZE, async () => {
    const files = [
      getIconCachePath(),
      getAppCachePath(),
      getUsageCachePath(),
      getFileSearchCachePath(),
    ];
    const totalBytes = files.reduce((sum, f) => sum + safeFileSize(f), 0);
    return { totalBytes };
  });

  ipcMain.handle(IPC.CLEAR_CACHE, async () => {
    appCache = null;
    iconCache.clear();
    usageData = {};
    fileSearchCache.clear();
    try { fs.unlinkSync(getIconCachePath()); } catch {}
    try { fs.unlinkSync(getAppCachePath()); } catch {}
    try { fs.unlinkSync(getUsageCachePath()); } catch {}
    try { fs.unlinkSync(getFileSearchCachePath()); } catch {}
    return true;
  });
}

module.exports = { registerHandlers };
