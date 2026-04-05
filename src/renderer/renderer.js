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
  window._ui.init();
  window._inputRouter.init();

  const input = document.getElementById('search-input');
  input.focus();

  // Re-focus input when window is shown
  window.trim.onWindowShown(() => {
    input.value = '';
    input.focus();
    window._ui.clearResults();
  });
}

loadNext();
