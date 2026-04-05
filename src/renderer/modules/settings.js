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
      <label class="settings-label">AI Model</label>
      <input type="text" class="settings-input" id="settings-model"
        placeholder="gemini-2.5-flash"
        value="${settings.model || 'gemini-2.5-flash'}">
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
  `;

  panel.querySelector('#settings-close-btn').addEventListener('click', close);
  panel.querySelector('#settings-save-btn').addEventListener('click', save);
}

async function save() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const model = document.getElementById('settings-model').value.trim();

  await window.trim.saveSettings({ apiKey, model });

  const msg = document.getElementById('settings-saved-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

window._settings = { open, close, isOpen: () => isOpen };
