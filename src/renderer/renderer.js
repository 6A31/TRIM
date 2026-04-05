// Trim — Renderer entry point
// Load all modules (order matters: modules first, then router + UI)

// Modules
const moduleScripts = [
  'modules/appSearch.js',
  'modules/aiQuery.js',
  'modules/calculator.js',
  'modules/folderSearch.js',
  'modules/commands.js',
  'modules/settings.js',
  'modules/chips.js',
  'ui.js',
  'inputRouter.js',
];

let loaded = 0;

function loadNext() {
  if (loaded >= moduleScripts.length) {
    boot();
    return;
  }
  const script = document.createElement('script');
  script.src = moduleScripts[loaded];
  script.onload = () => { loaded++; loadNext(); };
  script.onerror = (e) => { console.error('Failed to load:', moduleScripts[loaded], e); loaded++; loadNext(); };
  document.head.appendChild(script);
}

function boot() {
  try { window._chips.init(); } catch (e) { console.error('chips init:', e); }
  window._ui.init();
  window._inputRouter.init();

  const input = document.getElementById('search-input');
  input.focus();

  // Clean up on hide (not on show, to avoid old content blinking)
  window.trim.onWindowHidden(() => {
    const pinned = window._chips && window._chips.isActive('pin');
    if (!pinned) {
      input.value = '';
      window._ui.clearResults();
      if (window._chips) window._chips.updateMode('app');
    }
  });

  // Re-focus input when window is shown
  window.trim.onWindowShown(() => {
    const pinned = window._chips && window._chips.isActive('pin');
    if (pinned) {
      // Restore window size to fit pinned content
      requestAnimationFrame(() => {
        const barH = document.getElementById('search-bar').offsetHeight;
        const ai = document.getElementById('ai-response-container');
        const results = document.getElementById('results-container');
        const contentH = ai.classList.contains('hidden') ? results.scrollHeight : ai.scrollHeight;
        if (contentH > 0) {
          window.trim.resizeWindow(Math.min(barH + contentH, 500));
        }
      });
    }
    input.focus();
  });
}

loadNext();
