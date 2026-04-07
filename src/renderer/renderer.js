// Trim - Renderer entry point
// Load all modules (order matters: modules first, then router + UI)

// Modules
const moduleScripts = [
  'modules/appSearch.js',
  'modules/aiQuery.js',
  'modules/calculator.js',
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

  // Listen for file operation confirmations from main process
  window.trim.onConfirmAction((details) => {
    window._ui.showConfirmation(details);
  });

  const input = document.getElementById('search-input');
  // The initial window-shown event can arrive before this renderer finishes
  // wiring listeners, so seed the empty-state UI during boot as well.
  window._ui.clearResults();
  input.focus();

  // Clean up on hide (not on show, to avoid old content blinking)
  window.trim.onWindowHidden(() => {
    const hasChat = window._aiQuery && window._aiQuery.isFollowUp();
    input.value = '';
    if (window._inputRouter) window._inputRouter.refreshInputDecor(input);

    if (!hasChat) {
      window._ui.clearResults();
      if (window._chips) window._chips.updateMode('app');
      // Reset icon and hint to defaults
      const icon = document.getElementById('search-mode-icon');
      const hint = document.getElementById('search-hint');
      if (icon) { icon.textContent = 'search'; icon.classList.remove('active'); }
      if (hint) hint.textContent = '';
    }
  });

  // Re-focus input when window is shown
  window.trim.onWindowShown(() => {
    const hasChat = window._aiQuery && window._aiQuery.isFollowUp();
    if (hasChat) {
      const mode = window._aiQuery.getConversationPrefix ? window._aiQuery.getConversationPrefix() : 'ai';
      const prefix = mode === 'ai_pro' ? '?? '
        : mode === 'solve' ? 'cs: '
          : '? ';
      input.value = prefix;
      if (window._inputRouter) window._inputRouter.refreshInputDecor(input);
      input.setSelectionRange(prefix.length, prefix.length);
      input.dispatchEvent(new Event('input'));

      // Restore window size to fit persisted conversation
      requestAnimationFrame(() => {
        const barH = document.getElementById('search-bar').offsetHeight;
        const ai = document.getElementById('ai-response-container');
        const results = document.getElementById('results-container');
        const contentH = ai.classList.contains('hidden') ? results.scrollHeight : ai.scrollHeight;
        if (contentH > 0) {
          window.trim.resizeWindow(Math.min(barH + contentH, 500));
        }
      });
    } else {
      window._ui.clearResults();
    }
    input.focus();
  });
}

loadNext();
