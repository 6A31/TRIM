// Modular chip toggle system for the search bar
// Chips appear contextually based on input mode

const chips = new Map(); // id -> { label, icon, active, modes }
const activeToggles = {}; // id -> boolean
let inputEl = null;
let currentRawInput = '';
let currentResultsCount = 0;

function register(id, opts) {
  chips.set(id, {
    id,
    label: opts.label,
    icon: opts.icon || null,
    active: opts.default || false,
    modes: opts.modes || [], // which input modes show this chip
    action: typeof opts.action === 'function' ? opts.action : null,
    visibleWhen: typeof opts.visibleWhen === 'function' ? opts.visibleWhen : null,
  });
  activeToggles[id] = opts.default || false;
}

// Built-in chips
register('force_code', {
  label: 'Force Code',
  icon: 'code',
  default: false,
  modes: ['ai', 'ai_pro', 'solve'],
});

register('switch_ai', {
  label: 'Switch to AI?',
  icon: 'keyboard_return',
  default: false,
  modes: ['app'],
  visibleWhen: (ctx) => {
    const raw = (ctx.rawInput || '').trim();
    if (!raw) return false;
    if (raw.startsWith('/') || raw.startsWith('?') || raw.startsWith('c:') || raw.startsWith('f:') || raw.startsWith('cs:')) return false;
    if ((ctx.resultsCount || 0) > 0) return false;
    const whitespaceCount = (raw.match(/\s+/g) || []).length;
    return whitespaceCount >= 2;
  },
  action: () => {
    if (!inputEl) return;
    const raw = (inputEl.value || '').trim();
    if (!raw || raw.startsWith('?')) return;
    inputEl.value = `? ${raw}`;
    if (window._inputRouter) window._inputRouter.refreshInputDecor(inputEl);
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    inputEl.focus();
    inputEl.dispatchEvent(new Event('input'));
  },
});

function isActive(id) {
  return activeToggles[id] || false;
}

function toggle(id) {
  activeToggles[id] = !activeToggles[id];
  renderChips(chipMode);
}

let chipMode = 'app';
let container = null;
let collapsed = false;

function init() {
  container = document.getElementById('chip-container');
  inputEl = document.getElementById('search-input');
  // Collapse chips when input text gets long enough to crowd them
  inputEl.addEventListener('input', () => {
    currentRawInput = inputEl.value || '';
    const shouldCollapse = currentRawInput.length > 20;
    if (shouldCollapse !== collapsed) {
      collapsed = shouldCollapse;
      container.classList.toggle('collapsed', collapsed);
    }
    renderChips(chipMode);
  });
}

function deactivate(id) {
  activeToggles[id] = false;
  renderChips(chipMode);
}

function updateMode(mode) {
  if (mode === chipMode) return; // skip rebuild if unchanged — preserves CSS transitions
  // Leaving an AI/solve mode — deactivate force_code
  const aiModes = ['ai', 'ai_pro', 'solve'];
  if (aiModes.includes(chipMode) && !aiModes.includes(mode)) {
    activeToggles['force_code'] = false;
  }
  chipMode = mode;
  renderChips(mode);
}

function renderChips(mode) {
  if (!container) return;
  container.innerHTML = '';

  for (const [id, chip] of chips) {
    if (!chip.modes.includes(mode)) continue;
    if (chip.visibleWhen && !chip.visibleWhen({ rawInput: currentRawInput, mode, resultsCount: currentResultsCount })) continue;

    const el = document.createElement('button');
    const isAction = !!chip.action;
    el.className = 'input-chip' + (!isAction && activeToggles[id] ? ' active' : '');
    el.dataset.chipId = id;

    if (chip.icon) {
      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded';
      icon.style.fontSize = '14px';
      icon.textContent = chip.icon;
      el.appendChild(icon);
    }

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = chip.label;
    el.appendChild(label);

    // Prevent chip from stealing focus from the input
    el.addEventListener('mousedown', (e) => e.preventDefault());

    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (chip.action) chip.action();
      else toggle(id);
      // Re-focus search input
      document.getElementById('search-input').focus();
    });

    container.appendChild(el);
  }
}

function setResultsCount(count) {
  currentResultsCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  renderChips(chipMode);
}

function triggerVisibleAction() {
  for (const [, chip] of chips) {
    if (!chip.action) continue;
    if (!chip.modes.includes(chipMode)) continue;
    if (chip.visibleWhen && !chip.visibleWhen({ rawInput: currentRawInput, mode: chipMode, resultsCount: currentResultsCount })) {
      continue;
    }
    chip.action();
    return true;
  }
  return false;
}

window._chips = { init, updateMode, isActive, register, toggle, deactivate, setResultsCount, triggerVisibleAction };
