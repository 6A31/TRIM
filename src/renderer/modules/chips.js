// Modular chip toggle system for the search bar
// Chips appear contextually based on input mode

const chips = new Map(); // id -> { label, icon, active, modes }
const activeToggles = {}; // id -> boolean

function register(id, opts) {
  chips.set(id, {
    id,
    label: opts.label,
    icon: opts.icon || null,
    active: opts.default || false,
    modes: opts.modes || [], // which input modes show this chip
  });
  activeToggles[id] = opts.default || false;
}

// Built-in chips
register('show_output', {
  label: 'Show Output',
  icon: 'code',
  default: false,
  modes: ['ai', 'ai_pro'],
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

function init() {
  container = document.getElementById('chip-container');
}

function updateMode(mode) {
  chipMode = mode;
  renderChips(mode);
}

function renderChips(mode) {
  if (!container) return;
  container.innerHTML = '';

  for (const [id, chip] of chips) {
    if (!chip.modes.includes(mode)) continue;

    const el = document.createElement('button');
    el.className = 'input-chip' + (activeToggles[id] ? ' active' : '');
    el.dataset.chipId = id;

    if (chip.icon) {
      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded';
      icon.style.fontSize = '14px';
      icon.textContent = chip.icon;
      el.appendChild(icon);
    }

    const label = document.createElement('span');
    label.textContent = chip.label;
    el.appendChild(label);

    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle(id);
      // Re-focus search input
      document.getElementById('search-input').focus();
    });

    container.appendChild(el);
  }
}

window._chips = { init, updateMode, isActive, register, toggle };
