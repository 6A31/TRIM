const MODE_ICONS = {
  app: 'search',
  ai: 'auto_awesome',
  ai_pro: 'auto_awesome',
  solve: 'function',
  folder: 'folder_open',
  calc: 'calculate',
  command: 'terminal',
};

const MODE_HINTS = {
  app: '',
  ai: 'AI',
  ai_pro: 'AI PRO',
  solve: 'SOLVE',
  folder: 'FOLDERS',
  calc: 'CALC',
  command: 'CMD',
};

let debounceTimer = null;
let currentMode = 'app';

function init() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', () => {
    const raw = input.value;
    const mode = detectMode(raw);
    updateModeIndicator(raw);

    // Empty input — always clear and shrink
    if (!raw.trim()) {
      clearTimeout(debounceTimer);
      window._ui.clearResults();
      return;
    }

    // AI and solve only fire on Enter, not on typing
    if (mode === 'ai' || mode === 'ai_pro' || mode === 'solve') {
      clearTimeout(debounceTimer);
      return;
    }

    const delay = getDebounceDelay(raw);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => route(raw), delay);
  });
}

function getDebounceDelay(raw) {
  if (raw.startsWith('c:')) return 0;
  if (raw.startsWith('?')) return 300;
  return 120;
}

function detectMode(raw) {
  if (raw.startsWith('/')) return 'command';
  if (raw.startsWith('??')) return 'ai_pro';
  if (raw.startsWith('?')) return 'ai';
  if (raw.startsWith('cs:')) return 'solve';
  if (raw.startsWith('f:')) return 'folder';
  if (raw.startsWith('c:')) return 'calc';
  return 'app';
}

function updateModeIndicator(raw) {
  const mode = detectMode(raw);
  const icon = document.getElementById('search-mode-icon');
  const hint = document.getElementById('search-hint');

  icon.textContent = MODE_ICONS[mode];
  icon.classList.toggle('active', mode !== 'app');
  hint.textContent = MODE_HINTS[mode];
  currentMode = mode;

  // Update chips for current mode
  try { if (window._chips) window._chips.updateMode(mode); } catch {}
}

async function route(rawInput) {
  const input = rawInput.trim();

  if (!input) {
    window._ui.clearResults();
    return;
  }

  const mode = detectMode(input);

  if (mode === 'command') {
    const results = window._commands.search(input);
    window._ui.renderResults(results);
    return;
  }

  if (mode === 'calc') {
    const results = window._calculator.search(input.slice(2));
    window._ui.renderResults(results);
    return;
  }

  if (mode === 'folder') {
    const results = await window._folderSearch.search(input.slice(2));
    window._ui.renderResults(results);
    return;
  }

  if (mode === 'ai' || mode === 'ai_pro' || mode === 'solve') {
    return;
  }

  // Default: app search
  const results = await window._appSearch.search(input);
  window._ui.renderResults(results);
}

window._inputRouter = { init, route, detectMode };
