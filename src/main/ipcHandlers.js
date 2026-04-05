const { shell } = require('electron');
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { IPC, DEFAULTS } = require('../shared/constants');

let appCache = null;
const iconCache = new Map();
let ai = null; // GoogleGenAI client

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

// --- Python execution ---

const PYTHON_TOOL = {
  name: 'run_python',
  description: 'Execute a Python code snippet. Use for calculations, data processing, plotting charts, or any task that benefits from code execution. You can install pip packages first. For plots, use matplotlib and save to the path in the PLOT_PATH variable with plt.savefig(PLOT_PATH) — it will be displayed to the user automatically. Set show_output to true if the user should see the code and its output, false if you just need the result internally.',
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

function findPython() {
  const candidates = ['python', 'python3', 'py'];
  for (const cmd of candidates) {
    try {
      const result = execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
      if (result.startsWith('Python 3')) return cmd;
    } catch {}
  }
  return null;
}

let pythonCmd = null;

function runPythonCode(code, packages, plotPath) {
  return new Promise((resolve) => {
    if (!pythonCmd) pythonCmd = findPython();
    if (!pythonCmd) {
      resolve({ error: 'Python 3 not found. Please install Python 3.' });
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-py-'));
    const scriptPath = path.join(tmpDir, 'script.py');

    // Install packages if needed
    if (packages && packages.length > 0) {
      try {
        execSync(`${pythonCmd} -m pip install ${packages.join(' ')} --quiet`, {
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

    execFile(pythonCmd, [scriptPath], {
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

// --- AI init ---

const SYSTEM_INSTRUCTION = `You are a concise assistant inside a desktop launcher called Trim. Give short, direct answers — a few sentences max. Include all key facts but skip filler, introductions, and unnecessary detail. Use bullet points for lists. Never repeat the question.

You have access to a run_python tool for local code execution. Use it when:
- The user asks a math/science question that benefits from computation
- You need to plot or visualize data (save to PLOT_PATH using plt.savefig(PLOT_PATH))
- You need to process data or run algorithms
- A precise numerical answer is needed rather than an approximation
- You can install any pip package you need

Set show_output=true when the user would benefit from seeing the code/result (e.g. plots, tables, computed values). Set show_output=false when you just need an intermediate calculation to inform your answer.`;

const AI_TOOLS = [
  { googleSearch: {} },
  { functionDeclarations: [PYTHON_TOOL] },
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

async function handleAIQuery(event, query, usePro, forceShowOutput) {
  if (!ai) {
    return { error: 'No API key configured. Use /settings to add your Gemini API key.' };
  }

  const settings = loadSettingsSync();
  const modelName = usePro
    ? (settings.modelPro || 'gemini-3.1-pro-preview')
    : (settings.model || 'gemini-3-flash-preview');

  sendStatus(event, usePro ? 'Asking Gemini Pro...' : 'Asking Gemini...');

  try {
    const contents = [{ role: 'user', parts: [{ text: query }] }];
    const codeOutputs = [];
    const MAX_ROUNDS = 6;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          tools: AI_TOOLS,
          systemInstruction: SYSTEM_INSTRUCTION,
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

            if (packages.length > 0) {
              sendStatus(event, `Installing ${packages.join(', ')}...`);
            }
            sendStatus(event, 'Running Python code...');

            const plotPath = path.join(os.tmpdir(), `trim-plot-${Date.now()}.png`);
            const pyResult = await runPythonCode(code, packages, plotPath);

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

        return { text, sources, codeOutputs };
      }
    }

    // Fallback after max rounds
    return { text: 'Reached maximum processing rounds.', sources: [], codeOutputs };
  } catch (err) {
    return { error: err.message || 'AI query failed' };
  }
}

// --- Register all IPC handlers ---

function registerHandlers(ipcMain) {
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
        const { exec } = require('child_process');
        exec(`start shell:AppsFolder\\${appPath}`);
      }
    } catch (err) {
      console.error('Failed to open app:', err);
    }
  });

  ipcMain.handle(IPC.AI_QUERY, async (event, query, usePro, forceShowOutput) => {
    return handleAIQuery(event, query, usePro, forceShowOutput);
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
    appCache = null;
    return merged;
  });
}

module.exports = { registerHandlers };
