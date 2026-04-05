let isOpen = false;

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
  input.focus();
  window.trim.resizeWindow(68);
}

async function render() {
  const panel = document.getElementById('settings-panel');
  const settings = await window.trim.loadSettings();

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
      <div class="settings-description">Clears app list, icons, and usage data. Apps will be re-scanned.</div>
      <button class="settings-danger-btn" id="settings-clear-cache-btn">
        <span class="material-symbols-rounded" style="font-size:16px">delete_sweep</span>
        Clear Cache
      </button>
    </div>
  `;

  panel.querySelector('#settings-close-btn').addEventListener('click', close);
  panel.querySelector('#settings-save-btn').addEventListener('click', save);
  panel.querySelector('#settings-clear-cache-btn').addEventListener('click', async () => {
    await window.trim.clearCache();
    const btn = document.getElementById('settings-clear-cache-btn');
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">check_circle</span> Cleared';
    setTimeout(() => {
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">delete_sweep</span> Clear Cache';
    }, 2000);
  });
}

async function save() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const model = document.getElementById('settings-model').value.trim();
  const modelPro = document.getElementById('settings-model-pro').value.trim();

  await window.trim.saveSettings({ apiKey, model, modelPro });

  const msg = document.getElementById('settings-saved-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

window._settings = { open, close, isOpen: () => isOpen };
