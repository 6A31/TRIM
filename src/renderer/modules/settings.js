let isOpen = false;

const ACCENT_PRESETS = [
  { label: 'Indigo',  color: '#7c8aff' },
  { label: 'Blue',    color: '#4a9eff' },
  { label: 'Teal',    color: '#4ad4c6' },
  { label: 'Green',   color: '#4ae08a' },
  { label: 'Yellow',  color: '#f0c850' },
  { label: 'Orange',  color: '#ff9f4a' },
  { label: 'Red',     color: '#ff6b6b' },
  { label: 'Pink',    color: '#e06cc0' },
  { label: 'Purple',  color: '#b47cff' },
];

const APP_COLOR_PRESETS = [
  { label: 'Charcoal',  color: '#1e1e28' },
  { label: 'Dark',      color: '#121218' },
  { label: 'Midnight',  color: '#0d1117' },
  { label: 'Navy',      color: '#141826' },
  { label: 'Slate',     color: '#1e2630' },
  { label: 'Graphite',  color: '#2a2a2a' },
];

const APPEARANCE_DEFAULTS = {
  accentColor: '#7c8aff',
  appColor: '#1e1e28',
  transparency: 0.78,
  transparencyType: 'acrylic',
  showHints: false,
};

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

async function open() {
  const panel = document.getElementById('settings-panel');
  const results = document.getElementById('results-container');
  const aiContainer = document.getElementById('ai-response-container');

  results.classList.add('hidden');
  aiContainer.classList.add('hidden');
  panel.classList.remove('hidden');
  isOpen = true;

  await render();
  // Settings panel is tall — use full available height (main process caps at 60%)
  requestAnimationFrame(() => {
    const barH = document.getElementById('search-bar').offsetHeight;
    const panelH = document.getElementById('settings-panel').scrollHeight;
    window.trim.resizeWindow(barH + panelH);
  });
}

function close() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('hidden');
  panel.innerHTML = '';
  isOpen = false;

  const input = document.getElementById('search-input');
  input.value = '';
  if (window._inputRouter) window._inputRouter.refreshInputDecor(input);
  window._ui.clearResults();
  const icon = document.getElementById('search-mode-icon');
  const hint = document.getElementById('search-hint');
  if (icon) {
    icon.textContent = 'search';
    icon.classList.remove('active');
  }
  if (hint) hint.textContent = '';
  if (window._chips) window._chips.updateMode('app');
  requestAnimationFrame(() => input.focus());
}

// Light dismiss: hides the settings panel without clearing the search input.
function dismiss() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('hidden');
  panel.innerHTML = '';
  isOpen = false;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSwatches(presets, selectedColor, name) {
  return presets.map(p => {
    const active = p.color.toLowerCase() === selectedColor.toLowerCase();
    return `<button class="swatch${active ? ' active' : ''}" data-${name}="${p.color}"
      style="background:${p.color}" title="${p.label}"></button>`;
  }).join('');
}

function isAppearanceDirty(settings) {
  return (
    (settings.accentColor || APPEARANCE_DEFAULTS.accentColor).toLowerCase() !== APPEARANCE_DEFAULTS.accentColor ||
    (settings.appColor || APPEARANCE_DEFAULTS.appColor).toLowerCase() !== APPEARANCE_DEFAULTS.appColor ||
    Number(settings.transparency ?? APPEARANCE_DEFAULTS.transparency) !== APPEARANCE_DEFAULTS.transparency ||
    (settings.transparencyType || APPEARANCE_DEFAULTS.transparencyType) !== APPEARANCE_DEFAULTS.transparencyType ||
    Boolean(settings.showHints) !== APPEARANCE_DEFAULTS.showHints
  );
}

async function render() {
  const panel = document.getElementById('settings-panel');
  const [settings, cacheInfo] = await Promise.all([
    window.trim.loadSettings(),
    window.trim.getCacheSize(),
  ]);
  const cacheSizeLabel = formatBytes(cacheInfo?.totalBytes || 0);

  const accentColor = settings.accentColor || APPEARANCE_DEFAULTS.accentColor;
  const appColor = settings.appColor || APPEARANCE_DEFAULTS.appColor;
  const transparency = settings.transparency ?? APPEARANCE_DEFAULTS.transparency;
  const transparencyType = settings.transparencyType || APPEARANCE_DEFAULTS.transparencyType;
  const showHints = Boolean(settings.showHints);
  const showRevert = isAppearanceDirty(settings);

  panel.innerHTML = `
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="settings-close" id="settings-close-btn">
        <span class="material-symbols-rounded" style="font-size:18px">close</span>
      </button>
    </div>

    <!-- ─── Appearance ─── -->
    <div class="settings-section-title">
      <span class="material-symbols-rounded" style="font-size:16px">palette</span>
      Appearance
    </div>

    <div class="settings-group">
      <label class="settings-label">Accent Color</label>
      <div class="swatch-row" id="accent-swatches">
        ${buildSwatches(ACCENT_PRESETS, accentColor, 'accent')}
        <label class="swatch swatch-custom" title="Custom color">
          <input type="color" id="settings-accent-custom" value="${accentColor}">
          <span class="material-symbols-rounded" style="font-size:14px">colorize</span>
        </label>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">App Color</label>
      <div class="swatch-row" id="appcolor-swatches">
        ${buildSwatches(APP_COLOR_PRESETS, appColor, 'appcolor')}
        <label class="swatch swatch-custom" title="Custom color">
          <input type="color" id="settings-appcolor-custom" value="${appColor}">
          <span class="material-symbols-rounded" style="font-size:14px">colorize</span>
        </label>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Transparency <span class="settings-value-label" id="transparency-value">${Math.round((1 - transparency) * 100)}%</span></label>
      <input type="range" class="settings-slider" id="settings-transparency"
        min="0" max="100" value="${Math.round((1 - transparency) * 100)}">
    </div>

    <div class="settings-group">
      <label class="settings-label">Transparency Type</label>
      <div class="settings-segment" id="settings-transparency-type">
        <button class="segment-btn${transparencyType === 'acrylic' ? ' active' : ''}" data-value="acrylic">Acrylic</button>
        <button class="segment-btn${transparencyType === 'mica' ? ' active' : ''}" data-value="mica">Mica</button>
        <button class="segment-btn${transparencyType === 'none' ? ' active' : ''}" data-value="none">None</button>
      </div>
    </div>

    <div class="settings-group settings-toggle-group">
      <label class="settings-toggle-label" for="settings-show-hints">
        <span>Show tooltips</span>
        <input type="checkbox" id="settings-show-hints" class="settings-toggle" ${showHints ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
      <div class="settings-description">Display helpful hints below the search bar showing what each mode does (e.g. ? for AI, f: for files)</div>
    </div>

    <div class="settings-appearance-actions">
      <button class="settings-revert-btn" id="settings-revert-btn">
        <span class="material-symbols-rounded" style="font-size:14px">restart_alt</span>
        Revert to default
      </button>
    </div>

    <div class="settings-divider"></div>

    <!-- ─── AI & Models ─── -->
    <div class="settings-section-title">
      <span class="material-symbols-rounded" style="font-size:16px">auto_awesome</span>
      AI & Models
    </div>

    <div class="settings-group">
      <label class="settings-label">Gemini API Key</label>
      <input type="password" class="settings-input" id="settings-api-key"
        placeholder="Enter your Gemini API key"
        value="${escapeAttr(settings.apiKey || '')}">
      <div class="settings-description">Get a free key from Google AI Studio</div>
    </div>
    <div class="settings-group">
      <label class="settings-label">Flash Model <span class="settings-prefix">?</span></label>
      <input type="text" class="settings-input" id="settings-model"
        placeholder="gemini-3-flash-preview"
        value="${escapeAttr(settings.model || 'gemini-3-flash-preview')}">
    </div>
    <div class="settings-group">
      <label class="settings-label">Pro Model <span class="settings-prefix">??</span></label>
      <input type="text" class="settings-input" id="settings-model-pro"
        placeholder="gemini-3.1-pro-preview"
        value="${escapeAttr(settings.modelPro || 'gemini-3.1-pro-preview')}">
    </div>

    <div class="settings-divider"></div>

    <!-- ─── General ─── -->
    <div class="settings-section-title">
      <span class="material-symbols-rounded" style="font-size:16px">tune</span>
      General
    </div>

    <div class="settings-group">
      <label class="settings-label">Extra Cached File Types</label>
      <input type="text" class="settings-input" id="settings-cached-file-types"
        placeholder=".blend, .psd, .step"
        value="${escapeAttr(Array.isArray(settings.cachedFileTypes) ? settings.cachedFileTypes.join(', ') : '')}">
      <div class="settings-description">Comma-separated extensions to include in file cache whitelist (for f: and # picker).</div>
    </div>
    <div class="settings-group settings-toggle-group">
      <label class="settings-toggle-label" for="settings-autostart">
        <span>Launch on startup</span>
        <input type="checkbox" id="settings-autostart" class="settings-toggle" ${settings.autoStart !== false ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
      <div class="settings-description">If disabled, you'll need to reopen TRIM manually to re-enable this.</div>
    </div>

    <!-- ─── Save ─── -->
    <div class="settings-save-bar">
      <button class="settings-save" id="settings-save-btn">
        <span class="material-symbols-rounded settings-save-icon" style="font-size:16px">save</span>
        <span class="settings-save-text">Save</span>
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

  // ── Wire events ──
  panel.querySelector('#settings-close-btn').addEventListener('click', close);
  panel.querySelector('#settings-save-btn').addEventListener('click', save);

  // Accent swatches
  panel.querySelectorAll('[data-accent]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-accent]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('settings-accent-custom').value = btn.dataset.accent;
      previewAccent(btn.dataset.accent);
    });
  });

  // Accent custom color picker
  panel.querySelector('#settings-accent-custom').addEventListener('input', (e) => {
    panel.querySelectorAll('[data-accent]').forEach(b => b.classList.remove('active'));
    previewAccent(e.target.value);
  });

  // App color swatches
  panel.querySelectorAll('[data-appcolor]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-appcolor]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('settings-appcolor-custom').value = btn.dataset.appcolor;
      previewAppColor(btn.dataset.appcolor);
    });
  });

  // App color custom picker
  panel.querySelector('#settings-appcolor-custom').addEventListener('input', (e) => {
    panel.querySelectorAll('[data-appcolor]').forEach(b => b.classList.remove('active'));
    previewAppColor(e.target.value);
  });

  // Transparency slider (slider value = transparency %, stored value = opacity)
  const slider = panel.querySelector('#settings-transparency');
  slider.addEventListener('input', () => {
    document.getElementById('transparency-value').textContent = `${slider.value}%`;
    previewTransparency(1 - slider.value / 100);
  });

  // Transparency type segment
  panel.querySelectorAll('#settings-transparency-type .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('#settings-transparency-type .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Revert to default
  const revertBtn = panel.querySelector('#settings-revert-btn');
  if (revertBtn) {
    revertBtn.addEventListener('click', async () => {
      // Apply visual defaults immediately
      applyAppearance(APPEARANCE_DEFAULTS);
      if (window.trim.setBackgroundMaterial) {
        window.trim.setBackgroundMaterial(APPEARANCE_DEFAULTS.transparencyType);
      }
      // Persist defaults
      await window.trim.saveSettings({ ...APPEARANCE_DEFAULTS });
      if (window._ui && window._ui.loadHotfixContext) await window._ui.loadHotfixContext();
      render();
    });
  }

  // Clear cache
  panel.querySelector('#settings-clear-cache-btn').addEventListener('click', async () => {
    await window.trim.clearCache();
    const btn = document.getElementById('settings-clear-cache-btn');
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">check_circle</span> Cleared (0 B)';
    setTimeout(() => render(), 2000);
  });

  // Scroll to top on fresh render
  panel.scrollTop = 0;
}

function getSelectedAccent() {
  const active = document.querySelector('[data-accent].active');
  if (active) return active.dataset.accent;
  return document.getElementById('settings-accent-custom').value;
}

function getSelectedAppColor() {
  const active = document.querySelector('[data-appcolor].active');
  if (active) return active.dataset.appcolor;
  return document.getElementById('settings-appcolor-custom').value;
}

// Live previews — apply CSS vars without saving
function previewAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-glow', hexToGlow(color));
}

function previewAppColor(hex) {
  const t = 1 - Number(document.getElementById('settings-transparency').value) / 100;
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty('--bg-primary', `rgba(${r},${g},${b},${t})`);
  document.documentElement.style.setProperty('--bg-secondary', `rgba(${Math.min(r+15,255)},${Math.min(g+15,255)},${Math.min(b+18,255)},0.50)`);
}

function previewTransparency(t) {
  const hex = getSelectedAppColor();
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty('--bg-primary', `rgba(${r},${g},${b},${t})`);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function hexToGlow(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

function applyAppearance(s) {
  const accent = s.accentColor || APPEARANCE_DEFAULTS.accentColor;
  const appColor = s.appColor || APPEARANCE_DEFAULTS.appColor;
  const t = s.transparency ?? APPEARANCE_DEFAULTS.transparency;
  const { r, g, b } = hexToRgb(appColor);

  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-glow', hexToGlow(accent));
  document.documentElement.style.setProperty('--bg-primary', `rgba(${r},${g},${b},${t})`);
  document.documentElement.style.setProperty('--bg-secondary', `rgba(${Math.min(r+15,255)},${Math.min(g+15,255)},${Math.min(b+18,255)},0.50)`);
}

async function save() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const model = document.getElementById('settings-model').value.trim();
  const modelPro = document.getElementById('settings-model-pro').value.trim();
  const rawTypes = document.getElementById('settings-cached-file-types').value.trim();
  const autoStart = document.getElementById('settings-autostart').checked;
  const showHints = document.getElementById('settings-show-hints').checked;

  const accentColor = getSelectedAccent();
  const appColor = getSelectedAppColor();
  const transparency = 1 - Number(document.getElementById('settings-transparency').value) / 100;
  const activeType = document.querySelector('#settings-transparency-type .segment-btn.active');
  const transparencyType = activeType ? activeType.dataset.value : 'acrylic';

  const cachedFileTypes = rawTypes
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .map(t => (t.startsWith('.') ? t : `.${t}`))
    .filter((t, i, arr) => arr.indexOf(t) === i);

  await window.trim.saveSettings({
    apiKey, model, modelPro, cachedFileTypes, autoStart,
    showHints, accentColor, appColor, transparency, transparencyType,
  });

  // Apply appearance immediately
  applyAppearance({ accentColor, appColor, transparency });

  // Apply transparency type (acrylic/mica/none) via main process
  if (window.trim.setBackgroundMaterial) {
    window.trim.setBackgroundMaterial(transparencyType);
  }

  if (window._ui && window._ui.loadHotfixContext) await window._ui.loadHotfixContext();

  // Save button feedback
  const btn = document.getElementById('settings-save-btn');
  btn.classList.add('saved');
  btn.querySelector('.settings-save-icon').textContent = 'check';
  btn.querySelector('.settings-save-text').textContent = 'Saved';
  setTimeout(() => {
    render();
  }, 1500);
}

// Apply saved appearance on boot
async function applyOnBoot() {
  try {
    const settings = await window.trim.loadSettings();
    // Only override CSS defaults if user has customized appearance
    if (isAppearanceDirty(settings)) {
      applyAppearance(settings);
    }
    // Apply saved transparency type
    const type = settings.transparencyType || APPEARANCE_DEFAULTS.transparencyType;
    if (type !== 'acrylic' && window.trim.setBackgroundMaterial) {
      window.trim.setBackgroundMaterial(type);
    }
  } catch { /* defaults are fine from CSS */ }
}

window._settings = { open, close, dismiss, isOpen: () => isOpen, applyOnBoot };
