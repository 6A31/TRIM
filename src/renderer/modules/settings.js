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
  transparency: 0.76,
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
  // Settings panel is tall - use full available height (main process caps at 60%)
  requestAnimationFrame(() => {
    const barH = document.getElementById('search-bar').offsetHeight;
    const panelH = document.getElementById('settings-panel').scrollHeight;
    window.trim.resizeWindow(barH + panelH);
  });
}

function close() {
  cleanupShortcutRecorder();
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
  cleanupShortcutRecorder();
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
  const calcSyntax = settings.calcSyntax !== false;
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

    <div class="settings-group settings-toggle-group">
      <label class="settings-toggle-label" for="settings-acrylic-toggle">
        <span>Acrylic</span>
        <input type="checkbox" id="settings-acrylic-toggle" class="settings-toggle" ${transparencyType === 'acrylic' ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
      <div class="settings-description">Frosted glass transparency effect (Windows 11)</div>
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
      <label class="settings-label">Shortcut</label>
      <div class="shortcut-recorder" id="shortcut-recorder">
        <span class="shortcut-display" id="shortcut-display">${escapeAttr(prettyShortcut(settings.shortcut || 'Alt+Space'))}</span>
        <button class="shortcut-record-btn" id="shortcut-record-btn" title="Record new shortcut">
          <span class="material-symbols-rounded" style="font-size:14px">keyboard</span>
          Change
        </button>
        <button class="settings-revert-btn shortcut-default-btn" id="shortcut-default-btn" title="Restore default shortcut">
          <span class="material-symbols-rounded" style="font-size:14px">restart_alt</span>
          Default
        </button>
      </div>
      <div class="settings-description" id="shortcut-hint">Global keyboard shortcut to toggle TRIM.</div>
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

    <div class="settings-group settings-toggle-group">
      <label class="settings-toggle-label" for="settings-calc-syntax">
        <span>Calculator Syntax</span>
        <input type="checkbox" id="settings-calc-syntax" class="settings-toggle" ${calcSyntax ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
      <div class="settings-description">Highlight functions and constants in calculator expressions. Mistyped names stay unformatted.</div>
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

  // ── Shortcut recorder ──
  wireShortcutRecorder(panel, settings.shortcut || 'Alt+Space');

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
  const sliderGroup = slider.closest('.settings-group');
  slider.addEventListener('input', () => {
    document.getElementById('transparency-value').textContent = `${slider.value}%`;
    previewTransparency(1 - slider.value / 100);
  });

  // Acrylic toggle
  const acrylicToggle = panel.querySelector('#settings-acrylic-toggle');
  function updateSliderState(isAcrylic) {
    slider.disabled = !isAcrylic;
    sliderGroup.style.opacity = isAcrylic ? '1' : '0.4';
    sliderGroup.style.pointerEvents = isAcrylic ? '' : 'none';
    if (!isAcrylic) {
      const hex = getSelectedAppColor();
      const { r, g, b } = hexToRgb(hex);
      document.documentElement.style.setProperty('--bg-primary', `rgba(${r},${g},${b},1)`);
    } else {
      previewTransparency(1 - slider.value / 100);
    }
  }

  acrylicToggle.addEventListener('change', () => {
    updateSliderState(acrylicToggle.checked);
  });

  // Set initial slider state
  updateSliderState(transparencyType === 'acrylic');

  // Revert to default
  const revertBtn = panel.querySelector('#settings-revert-btn');
  if (revertBtn) {
    revertBtn.addEventListener('click', async () => {
      // Apply visual defaults immediately
      applyAppearance(APPEARANCE_DEFAULTS);
      if (window.trim.setBackgroundMaterial) {
        window.trim.setBackgroundMaterial(APPEARANCE_DEFAULTS.transparencyType, APPEARANCE_DEFAULTS.appColor);
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

// ── Shortcut recorder ──
let pendingShortcut = null;
let _recorderCleanup = null;

function cleanupShortcutRecorder() {
  if (_recorderCleanup) _recorderCleanup();
  pendingShortcut = null;
}

const MODIFIER_KEYS = new Set([
  'Control', 'Shift', 'Alt', 'Meta',
]);

const KEY_MAP = {
  ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
  'ArrowLeft': 'Left', 'ArrowRight': 'Right',
  '+': 'Plus', '=': 'Plus',
};

function keyEventToAccelerator(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (MODIFIER_KEYS.has(e.key)) return null; // modifier only, not a valid combo
  let key = KEY_MAP[e.key] || e.key;
  // Capitalise single letters
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  // Require at least one modifier
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return null;
  return parts.join('+');
}

function prettyShortcut(accel) {
  if (!accel) return '';
  const ctrlLabel = navigator.platform?.startsWith('Mac') ? 'Cmd' : 'Ctrl';
  return accel.replace('CommandOrControl', ctrlLabel);
}

function wireShortcutRecorder(panel, savedShortcut) {
  const display = panel.querySelector('#shortcut-display');
  const recordBtn = panel.querySelector('#shortcut-record-btn');
  const defaultBtn = panel.querySelector('#shortcut-default-btn');
  const hint = panel.querySelector('#shortcut-hint');
  const recorder = panel.querySelector('#shortcut-recorder');

  let recording = false;
  let captured = null;
  pendingShortcut = null;

  function onKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      stopRecording();
      display.textContent = prettyShortcut(pendingShortcut || savedShortcut);
      hint.textContent = 'Global keyboard shortcut to toggle TRIM.';
      return;
    }
    const accel = keyEventToAccelerator(e);
    if (!accel) return; // modifier-only press, keep waiting
    stopRecording();
    captured = accel;
    showConfirm(accel);
  }

  function onConfirmKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Enter') {
      pendingShortcut = captured;
      display.textContent = prettyShortcut(captured);
      clearConfirm();
      recorder.classList.add('changed');
      hint.innerHTML = `Shortcut changed. Click <strong>Save</strong> to apply.`;
    } else if (e.key === 'Escape') {
      display.textContent = prettyShortcut(pendingShortcut || savedShortcut);
      clearConfirm();
    }
  }

  function onSystemKey(accel) {
    if (!recording) return;
    stopRecording();
    captured = accel;
    showConfirm(accel);
  }

  function stopRecording() {
    recording = false;
    recorder.classList.remove('recording');
    recordBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">keyboard</span> Change';
    document.removeEventListener('keydown', onKey, true);
    window.trim.offSystemKey();
    window.trim.resumeShortcut();
  }

  function showConfirm(accelerator) {
    display.textContent = prettyShortcut(accelerator);
    recorder.classList.add('confirming');
    hint.innerHTML = `Captured <strong>${prettyShortcut(accelerator)}</strong> - press <strong>Enter</strong> to confirm or <strong>Escape</strong> to cancel.`;
    document.addEventListener('keydown', onConfirmKey, true);
  }

  function clearConfirm() {
    recorder.classList.remove('confirming');
    hint.textContent = 'Global keyboard shortcut to toggle TRIM.';
    document.removeEventListener('keydown', onConfirmKey, true);
    captured = null;
  }

  // Expose cleanup so close/dismiss can tear down listeners
  _recorderCleanup = () => {
    stopRecording();
    clearConfirm();
    _recorderCleanup = null;
  };

  recordBtn.addEventListener('click', () => {
    if (recording) {
      stopRecording();
      display.textContent = prettyShortcut(pendingShortcut || savedShortcut);
      hint.textContent = 'Global keyboard shortcut to toggle TRIM.';
      return;
    }
    recording = true;
    recorder.classList.add('recording');
    clearConfirm();
    display.textContent = 'Press a key combo...';
    recordBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">close</span> Cancel';
    hint.textContent = 'Press a modifier + key (e.g. Alt+Space, Ctrl+Space).';
    window.trim.suspendShortcut();
    window.trim.onSystemKey(onSystemKey);
    document.addEventListener('keydown', onKey, true);
  });

  defaultBtn.addEventListener('click', () => {
    stopRecording();
    clearConfirm();
    pendingShortcut = 'Alt+Space';
    display.textContent = prettyShortcut('Alt+Space');
    recorder.classList.remove('changed');
    if (savedShortcut !== 'Alt+Space') {
      recorder.classList.add('changed');
      hint.innerHTML = `Shortcut reset to default. Click <strong>Save</strong> to apply.`;
    } else {
      // Brief flash to confirm the click was received
      recorder.classList.add('confirming');
      hint.textContent = 'Already using the default shortcut.';
      setTimeout(() => {
        recorder.classList.remove('confirming');
        hint.textContent = 'Global keyboard shortcut to toggle TRIM.';
      }, 1200);
    }
  });
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

// Live previews - apply CSS vars without saving
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
  const type = s.transparencyType || APPEARANCE_DEFAULTS.transparencyType;
  // When "none", ignore transparency slider - force fully opaque
  const t = type === 'none' ? 1 : (s.transparency ?? APPEARANCE_DEFAULTS.transparency);
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
  const calcSyntax = document.getElementById('settings-calc-syntax').checked;

  const accentColor = getSelectedAccent();
  const appColor = getSelectedAppColor();
  const transparency = 1 - Number(document.getElementById('settings-transparency').value) / 100;
  const transparencyType = document.getElementById('settings-acrylic-toggle').checked ? 'acrylic' : 'none';

  const cachedFileTypes = rawTypes
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .map(t => (t.startsWith('.') ? t : `.${t}`))
    .filter((t, i, arr) => arr.indexOf(t) === i);

  const settingsData = {
    apiKey, model, modelPro, cachedFileTypes, autoStart,
    showHints, calcSyntax, accentColor, appColor, transparency, transparencyType,
  };

  // Include shortcut if it was changed
  if (pendingShortcut) {
    // Test-register the shortcut first
    const ok = await window.trim.updateShortcut(pendingShortcut);
    if (!ok) {
      const hint = document.getElementById('shortcut-hint');
      if (hint) hint.innerHTML = '<span style="color:#ff6b6b">Shortcut conflict - another app is using it. Try a different combo.</span>';
      return;
    }
    settingsData.shortcut = pendingShortcut;
  }

  await window.trim.saveSettings(settingsData);

  // Apply appearance immediately
  applyAppearance({ accentColor, appColor, transparency, transparencyType });

  // Update calc syntax overlay setting
  if (window._inputRouter && window._inputRouter.setCalcSyntax) {
    window._inputRouter.setCalcSyntax(calcSyntax);
  }

  // Apply transparency type (acrylic/mica/none) via main process
  if (window.trim.setBackgroundMaterial) {
    window.trim.setBackgroundMaterial(transparencyType, appColor);
  }

  if (window._ui && window._ui.loadHotfixContext) await window._ui.loadHotfixContext();

  pendingShortcut = null;

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
    const appColor = settings.appColor || APPEARANCE_DEFAULTS.appColor;
    if (type !== 'acrylic' && window.trim.setBackgroundMaterial) {
      window.trim.setBackgroundMaterial(type, appColor);
    }
  } catch { /* defaults are fine from CSS */ }
}

window._settings = { open, close, dismiss, isOpen: () => isOpen, applyOnBoot };
