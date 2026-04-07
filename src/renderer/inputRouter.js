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
let filePickActive = false;
let activeFolderRequestId = null;
let activeFilePickRequestId = null;
const aiFileRefs = new Map(); // label -> absolute path
let inputOverlayEl = null;

function init() {
  const input = document.getElementById('search-input');
  inputOverlayEl = document.getElementById('search-input-overlay');

  input.addEventListener('scroll', () => {
    syncOverlayScroll(input);
  });

  window.trim.offFolderSearchUpdate();
  window.trim.onFolderSearchUpdate((data) => {
    const currentRaw = input.value;
    const mode = detectMode(currentRaw);

    if (!data || !Array.isArray(data.results)) return;

    if (mode === 'folder') {
      const q = currentRaw.trim().slice(2).trim();
      if (data.requestId !== activeFolderRequestId || data.query !== q) return;
      const mapped = data.results.map(entry => ({
        type: 'folder',
        icon: entry.isDirectory ? 'folder' : 'description',
        title: entry.name,
        subtitle: entry.path,
        action: () => window.trim.openFolder(entry.path),
      }));
      window._ui.renderResults(mapped);
      return;
    }

    if ((mode === 'ai' || mode === 'ai_pro' || mode === 'solve') && filePickActive) {
      const hashMatch = currentRaw.match(/#([^#\\\/\s][^#\\\/]*)$/);
      const searchTerm = hashMatch && hashMatch[1] ? hashMatch[1].trim() : '';
      if (!searchTerm) return;
      if (data.requestId !== activeFilePickRequestId || data.query !== searchTerm) return;
      const mapped = data.results.map(entry => ({
        type: 'file-ref',
        icon: entry.isDirectory ? 'folder' : 'description',
        title: entry.name,
        subtitle: entry.path,
        action: () => insertFileRef(input, entry.path),
      }));
      window._ui.renderResults(mapped);
    }
  });

  input.addEventListener('input', () => {
    // Auto-dismiss settings panel when user starts typing in the search bar
    if (window._settings && window._settings.isOpen()) {
      window._settings.dismiss();
    }

    const raw = input.value;
    const mode = detectMode(raw);
    updateModeIndicator(raw);
    refreshInputDecor(input);

    // Empty input - always clear and shrink
    if (!raw.trim()) {
      clearTimeout(debounceTimer);
      window._ui.clearResults();
      return;
    }

    // AI and solve only fire on Enter, not on typing
    if (mode === 'ai' || mode === 'ai_pro' || mode === 'solve') {
      clearTimeout(debounceTimer);

      // Check for #file references - show file picker
      const hashMatch = raw.match(/#([^#\\\/\s][^#\\\/]*)$/);
      if (hashMatch && hashMatch[1].trim()) {
        const searchTerm = hashMatch[1].trim();
        filePickActive = true;
        debounceTimer = setTimeout(async () => {
          const payload = await window.trim.searchFolders(searchTerm);
          const results = Array.isArray(payload) ? payload : (payload?.results || []);
          activeFilePickRequestId = payload?.requestId || null;
          const mapped = results.map(entry => ({
            type: 'file-ref',
            icon: entry.isDirectory ? 'folder' : 'description',
            title: entry.name,
            subtitle: entry.path,
            action: () => insertFileRef(input, entry.path),
          }));
          window._ui.renderResults(mapped);
        }, 150);
        return;
      }

      // No active file pick - restore AI area if needed
      if (filePickActive) {
        filePickActive = false;
        activeFilePickRequestId = null;
        window._ui.restoreAIArea();
        return;
      }

      // HOTFIX: Keep AI-prefix typing on the shared empty-state helper so the
      // 100%-scale placeholder row can prevent the broken collapsed layout.
      // restoreAIArea preserves existing AI output and only falls back to hints
      // when there is no active AI content to show.
      window._ui.restoreAIArea();
      return;
    }
    filePickActive = false;
    activeFilePickRequestId = null;

    const delay = getDebounceDelay(raw);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => route(raw), delay);
  });

  refreshInputDecor(input);
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
    const payload = await window.trim.searchFolders(input.slice(2));
    const results = (Array.isArray(payload) ? payload : (payload?.results || [])).map(entry => ({
      type: 'folder',
      icon: entry.isDirectory ? 'folder' : 'description',
      title: entry.name,
      subtitle: entry.path,
      action: () => window.trim.openFolder(entry.path),
    }));
    activeFolderRequestId = payload?.requestId || null;
    window._ui.renderResults(results);
    return;
  }

  activeFolderRequestId = null;

  if (mode === 'ai' || mode === 'ai_pro' || mode === 'solve') {
    return;
  }

  // Default: app search
  const results = await window._appSearch.search(input);
  window._ui.renderResults(results);
}

function insertFileRef(inputEl, filePath) {
  const val = inputEl.value;
  const hashMatch = val.match(/#([^#\\\/]*)$/);
  const base = filePath.split(/[/\\]/).pop() || filePath;
  const label = makeUniqueRefLabel(base, inputEl.value, filePath);
  aiFileRefs.set(label, filePath);
  const token = `#[${label}]`;

  if (hashMatch) {
    inputEl.value = val.slice(0, hashMatch.index) + token + ' ';
  } else {
    // Fallback: append
    inputEl.value = val + token + ' ';
  }
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  inputEl.focus();
  refreshInputDecor(inputEl);
  filePickActive = false;
  window._ui.restoreAIArea();
}

function makeUniqueRefLabel(baseLabel, rawInput, targetPath) {
  const active = new Set(getActiveRefLabels(rawInput || ''));
  if (!active.has(baseLabel)) return baseLabel;

  const existingPath = aiFileRefs.get(baseLabel);
  if (existingPath && existingPath === targetPath) return baseLabel;

  let n = 2;
  let next = `${baseLabel} (${n})`;
  while (active.has(next) && aiFileRefs.get(next) !== targetPath) {
    n += 1;
    next = `${baseLabel} (${n})`;
  }
  return next;
}

function getActiveRefLabels(value) {
  const labels = [];
  const tokenRegex = /#\[([^\]]+)\]/g;
  let m;
  while ((m = tokenRegex.exec(value || '')) !== null) {
    labels.push(m[1]);
  }
  return labels;
}

function pruneStaleFileRefs(rawValue) {
  const active = new Set(getActiveRefLabels(rawValue || ''));
  for (const key of aiFileRefs.keys()) {
    if (!active.has(key)) aiFileRefs.delete(key);
  }
}

function resolveAIFileRefsInQuery(query) {
  let out = query;
  for (const [label, fullPath] of aiFileRefs.entries()) {
    const token = `#[${label}]`;
    if (out.includes(token)) {
      out = out.split(token).join(`#"${fullPath}"`);
    }
  }
  return out;
}

function updateFileRefTooltip(inputEl) {
  const value = inputEl.value || '';
  const lines = [];
  for (const [label, fullPath] of aiFileRefs.entries()) {
    if (value.includes(`#[${label}]`)) {
      lines.push(`${label} -> ${fullPath}`);
    }
  }
  inputEl.title = lines.join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInputOverlay(inputEl) {
  if (!inputOverlayEl) return;
  const raw = inputEl.value || '';
  const hasRefs = /#\[[^\]]+\]/.test(raw);

  // Check for conversation follow-up hint: input is just the prefix (e.g. "? " or "?? ")
  const prefixOnly = /^(\?\??\s*|cs:\s*)$/.test(raw);
  const inConversation = window._aiQuery && window._aiQuery.isFollowUp();

  if (!hasRefs && !prefixOnly) {
    inputOverlayEl.innerHTML = '';
    inputOverlayEl.style.display = 'none';
    inputEl.style.color = '';
    inputEl.style.webkitTextFillColor = '';
    return;
  }

  // Show conversation hint when input is just the prefix
  if (!hasRefs && prefixOnly && inConversation) {
    inputOverlayEl.style.display = '';
    // Keep native text visible (the prefix) — don't hide it
    inputEl.style.color = '';
    inputEl.style.webkitTextFillColor = '';
    // Invisible spacer matching the prefix width, then muted hint
    const spacer = `<span style="visibility:hidden">${escapeHtml(raw)}</span>`;
    inputOverlayEl.innerHTML = `${spacer}<span class="conv-hint">Ask a follow-up or <span class="material-symbols-rounded conv-hint-icon">backspace</span> to exit</span>`;
    return;
  }

  if (!hasRefs) {
    inputOverlayEl.innerHTML = '';
    inputOverlayEl.style.display = 'none';
    inputEl.style.color = '';
    inputEl.style.webkitTextFillColor = '';
    return;
  }

  // Has file ref pills — show overlay, hide native input text
  inputOverlayEl.style.display = '';
  inputEl.style.color = 'transparent';
  inputEl.style.webkitTextFillColor = 'transparent';

  const tokenRegex = /#\[([^\]]+)\]/g;
  let html = '';
  let idx = 0;
  let match;

  while ((match = tokenRegex.exec(raw)) !== null) {
    const before = raw.slice(idx, match.index);
    if (before) {
      html += `<span class="input-overlay-text">${escapeHtml(before)}</span>`;
    }
    const label = match[1];
    html += `<span class="file-ref-pill"><span class="file-ref-hidden-brackets">[</span><span class="file-ref-visible">#${escapeHtml(label)}</span><span class="file-ref-hidden-brackets">]</span></span>`;
    idx = match.index + match[0].length;
  }

  const tail = raw.slice(idx);
  if (tail) {
    html += `<span class="input-overlay-text">${escapeHtml(tail)}</span>`;
  }

  inputOverlayEl.innerHTML = html;
}

function syncOverlayScroll(inputEl) {
  if (!inputOverlayEl || inputOverlayEl.style.display === 'none') return;
  const containerW = inputOverlayEl.parentElement.clientWidth;
  const contentW = inputOverlayEl.scrollWidth;
  if (contentW > containerW) {
    inputOverlayEl.style.transform = `translateX(${containerW - contentW}px)`;
  } else {
    inputOverlayEl.style.transform = '';
  }
}

function refreshInputDecor(inputEl) {
  pruneStaleFileRefs(inputEl.value || '');
  updateFileRefTooltip(inputEl);
  renderInputOverlay(inputEl);
  requestAnimationFrame(() => syncOverlayScroll(inputEl));
}

function isFilePickActive() {
  return filePickActive;
}

window._inputRouter = { init, route, detectMode, isFilePickActive, resolveAIFileRefsInQuery, refreshInputDecor };
