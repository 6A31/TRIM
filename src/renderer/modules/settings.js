let isOpen = false;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[idx]}`;
}

function open() {
  const panel = document.getElementById('settings-panel');
  const results = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');

  results.classList.add('hidden');
  aiContainer.classList.add('hidden');
  panel.classList.remove('hidden');
  isOpen = true;

  render();
  window.trim.resizeWindow(400);
}

function close() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('hidden');
  isOpen = false;

  const input = document.getElementById('search-input');
  input.value = '';
  if (window._inputRouter) window._inputRouter.refreshInputDecor(input);
  // Reset result chrome so the bar returns to single-line mode (no empty lip).
  if (window._ui && window._ui.renderResults) {
    window._ui.renderResults([]);
  }
  // Reset mode indicator and hint to default app mode.
  const icon = document.getElementById('search-mode-icon');
  const hint = document.getElementById('search-hint');
  if (icon) {
    icon.textContent = 'search';
    icon.classList.remove('active');
  }
  if (hint) hint.textContent = '';
  if (window._chips) window._chips.updateMode('app');
  input.focus();
}

async function render() {
  const panel = document.getElementById('settings-panel');
  const [settings, cacheInfo] = await Promise.all([
    window.trim.loadSettings(),
    window.trim.getCacheSize(),
  ]);
  const cacheSizeLabel = formatBytes(cacheInfo?.totalBytes || 0);

  panel.innerHTML = `
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="settings-close" id="settings-close-btn">
        <span class="material-symbols-rounded" style="font-size:18px">close</span>
      </button>
    </div>
    <div class="settings-group">
      <label class="settings-label">Gemini API Key</label>
      <input type="password" class="settings-input" id="settings-api-key"
        placeholder="Enter your Gemini API key"
        value="${settings.apiKey || ''}">
      <div class="settings-description">Get a free key from Google AI Studio</div>
    </div>
    <div class="settings-group">
      <label class="settings-label">Flash Model <span class="settings-prefix">?</span></label>
      <input type="text" class="settings-input" id="settings-model"
        placeholder="gemini-3-flash-preview"
        value="${settings.model || 'gemini-3-flash-preview'}">
    </div>
    <div class="settings-group">
      <label class="settings-label">Pro Model <span class="settings-prefix">??</span></label>
      <input type="text" class="settings-input" id="settings-model-pro"
        placeholder="gemini-3.1-pro-preview"
        value="${settings.modelPro || 'gemini-3.1-pro-preview'}">
    </div>
    <div class="settings-group">
      <label class="settings-label">Extra Cached File Types</label>
      <input type="text" class="settings-input" id="settings-cached-file-types"
        placeholder=".blend, .psd, .step"
        value="${Array.isArray(settings.cachedFileTypes) ? settings.cachedFileTypes.join(', ') : ''}">
      <div class="settings-description">Comma-separated extensions to include in file cache whitelist (for f: and # picker).</div>
    </div>
    <div style="display:flex;align-items:center;margin-top:8px">
      <button class="settings-save" id="settings-save-btn">
        <span class="material-symbols-rounded" style="font-size:16px">save</span>
        Save
      </button>
      <span class="settings-saved" id="settings-saved-msg">
        <span class="material-symbols-rounded" style="font-size:14px">check_circle</span>
        Saved
      </span>
    </div>
    <div class="settings-group" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
      <label class="settings-label">Cache</label>
      <div class="settings-description">Clears app list, icons, usage data, and file search cache. Apps will be re-scanned.</div>
      <button class="settings-danger-btn" id="settings-clear-cache-btn">
        <span class="material-symbols-rounded" style="font-size:16px">delete_sweep</span>
        Clear Cache (${cacheSizeLabel})
      </button>
    </div>
  `;

  panel.querySelector('#settings-close-btn').addEventListener('click', close);
  panel.querySelector('#settings-save-btn').addEventListener('click', save);
  panel.querySelector('#settings-clear-cache-btn').addEventListener('click', async () => {
    await window.trim.clearCache();
    const btn = document.getElementById('settings-clear-cache-btn');
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">check_circle</span> Cleared (0 B)';
    setTimeout(() => {
      render();
    }, 2000);
  });
}

async function save() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const model = document.getElementById('settings-model').value.trim();
  const modelPro = document.getElementById('settings-model-pro').value.trim();
  const rawTypes = document.getElementById('settings-cached-file-types').value.trim();

  const cachedFileTypes = rawTypes
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .map(t => (t.startsWith('.') ? t : `.${t}`))
    .filter((t, i, arr) => arr.indexOf(t) === i);

  await window.trim.saveSettings({ apiKey, model, modelPro, cachedFileTypes });

  const msg = document.getElementById('settings-saved-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
  render();
}

window._settings = { open, close, isOpen: () => isOpen };
