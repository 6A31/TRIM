const { shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { IPC, DEFAULTS } = require('../shared/constants');

let appCache = null;
const iconCache = new Map();
let genAI = null;
let aiModel = null;

function getScriptsPath() {
  const devPath = path.join(__dirname, '..', '..', 'scripts');
  if (fs.existsSync(devPath)) return devPath;
  return path.join(process.resourcesPath, 'scripts');
}

function runPowerShell(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, ...args,
    ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
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
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// --- AI init ---

function initAI(apiKey) {
  if (!apiKey) { genAI = null; aiModel = null; return; }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  genAI = new GoogleGenerativeAI(apiKey);
  const settings = loadSettingsSync();
  aiModel = genAI.getGenerativeModel({
    model: settings.model || 'gemini-2.5-flash',
    tools: [
      { googleSearch: {} },
      { codeExecution: {} },
    ],
    systemInstruction: `You are a concise assistant inside a desktop launcher called Trim. Give short, direct answers — a few sentences max. Include all key facts but skip filler, introductions, and unnecessary detail. Use bullet points for lists. Never repeat the question.

You have access to code execution. Use it when:
- The user asks a math/science question that benefits from computation
- You need to plot or visualize data with matplotlib
- You need to process data or run algorithms
- A precise numerical answer is needed rather than an approximation`,
  });
}

// --- Register all IPC handlers ---

function registerHandlers(ipcMain) {
  // Init AI with saved key
  const settings = loadSettingsSync();
  if (settings.apiKey) initAI(settings.apiKey);

  ipcMain.handle(IPC.SEARCH_APPS, async () => {
    if (appCache) return appCache;
    const script = path.join(getScriptsPath(), 'enumerateApps.ps1');
    const raw = await runPowerShell(script);
    try {
      appCache = JSON.parse(raw);
    } catch {
      appCache = [];
    }
    return appCache;
  });

  ipcMain.handle(IPC.GET_ICON, async (_e, exePath) => {
    if (iconCache.has(exePath)) return iconCache.get(exePath);
    const script = path.join(getScriptsPath(), 'extractIcon.ps1');
    try {
      const base64 = await runPowerShell(script, [exePath]);
      const dataUri = `data:image/png;base64,${base64}`;
      iconCache.set(exePath, dataUri);
      return dataUri;
    } catch {
      iconCache.set(exePath, null);
      return null;
    }
  });

  ipcMain.handle(IPC.OPEN_APP, async (_e, appPath) => {
    try {
      if (appPath.endsWith('.lnk') || appPath.endsWith('.exe')) {
        shell.openPath(appPath);
      } else {
        // UWP AppUserModelId
        const { exec } = require('child_process');
        exec(`start shell:AppsFolder\\${appPath}`);
      }
    } catch (err) {
      console.error('Failed to open app:', err);
    }
  });

  // --- AI query with built-in code execution + google search ---
  ipcMain.handle(IPC.AI_QUERY, async (event, query) => {
    if (!aiModel) {
      return { error: 'No API key configured. Use /settings to add your Gemini API key.' };
    }

    try {
      const result = await aiModel.generateContent(query);
      const response = result.response;
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract text, code executions, and results from parts
      let text = '';
      const codeOutputs = [];
      let currentCode = null;

      for (const part of parts) {
        if (part.text) {
          text += part.text;
        }
        if (part.executableCode) {
          currentCode = part.executableCode.code;
        }
        if (part.codeExecutionResult) {
          codeOutputs.push({
            code: currentCode,
            stdout: part.codeExecutionResult.output || null,
            error: part.codeExecutionResult.outcome === 'OUTCOME_OK' ? null : (part.codeExecutionResult.output || 'Execution failed'),
          });
          currentCode = null;
        }
      }

      // If there was code with no result yet, still track it
      if (currentCode) {
        codeOutputs.push({ code: currentCode, stdout: null, error: null });
      }

      const grounding = candidate?.groundingMetadata;
      const sources = grounding?.groundingChunks
        ?.filter(c => c.web)
        .map(c => ({ title: c.web.title, uri: c.web.uri })) || [];

      return { text, sources, codeOutputs };
    } catch (err) {
      return { error: err.message || 'AI query failed' };
    }
  });

  ipcMain.handle(IPC.SEARCH_FOLDERS, async (_e, query) => {
    try {
      const searchPath = query.includes(':') || query.startsWith('/') || query.startsWith('\\')
        ? query
        : path.join(require('os').homedir(), query);

      const dir = path.dirname(searchPath);
      const pattern = path.basename(searchPath).toLowerCase();

      if (!fs.existsSync(dir)) return [];

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter(e => e.name.toLowerCase().includes(pattern || ''))
        .slice(0, 20)
        .map(e => ({
          name: e.name,
          path: path.join(dir, e.name),
          isDirectory: e.isDirectory(),
        }));
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC.OPEN_FOLDER, async (_e, folderPath) => {
    shell.openPath(folderPath);
  });

  ipcMain.handle(IPC.LOAD_SETTINGS, async () => {
    return loadSettingsSync();
  });

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_e, data) => {
    const current = loadSettingsSync();
    const merged = { ...current, ...data };
    fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2));
    if (data.apiKey !== undefined) initAI(data.apiKey);
    appCache = null; // force re-scan on next search
    return merged;
  });
}

module.exports = { registerHandlers };
