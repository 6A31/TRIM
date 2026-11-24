// Module scope: renderer scripts are classic <script>s, so without this wrapper
// every top-level function becomes a global and modules overwrite each other
// (and builtins like window.open / window.close).
(function () {
const registry = new Map();

function register(name, opts) {
  registry.set(name.toLowerCase(), { name, ...opts });
}

// Built-in commands
register('/help', {
  description: 'Show available prefixes and commands',
  icon: 'help',
  execute: () => {
    const helpResults = [
      { type: 'command', icon: 'search', title: 'app name', subtitle: 'Launch apps — type to search, Enter or click to open' },
      { type: 'command', icon: 'auto_awesome', title: '? question', subtitle: 'Gemini Flash — chat, generate images, read/write files, run Python' },
      { type: 'command', icon: 'auto_awesome', title: '?? question', subtitle: 'Gemini Pro — same tools, stronger reasoning' },
      { type: 'command', icon: 'image', title: 'Ctrl+V images', subtitle: 'Paste one or more screenshots/images into AI chat (accumulates)' },
      { type: 'command', icon: 'stop_circle', title: 'Esc', subtitle: 'Stop a running AI answer (press again to hide TRIM)' },
      { type: 'command', icon: 'history', title: '? history', subtitle: 'Type ? alone to browse past chats — clear ? to start a new convo' },
      { type: 'command', icon: 'attach_file', title: '#filename', subtitle: 'Attach a file to your AI query (Tab to autocomplete)' },
      { type: 'command', icon: 'calculate', title: 'c: expression', subtitle: 'Math (SymPy). Quick results for arithmetic; a CAS worksheet for the rest ($1, ans, f(x) := ...)' },
      { type: 'command', icon: 'folder_open', title: 'f: path', subtitle: 'Browse and open files and folders on your system' },
      { type: 'command', icon: 'terminal', title: '/ command', subtitle: '/settings, /clear (reset AI chat), /history, /reload, /help' },
    ];
    window._ui.renderResults(helpResults);
  },
});
register('/settings', {
  description: 'Open TRIM settings',
  icon: 'settings',
  execute: () => window._settings.open(),
});

register('/reload', {
  description: 'Reload TRIM UI',
  icon: 'refresh',
  execute: () => location.reload(),
});

register('/clear', {
  description: 'Reset current AI chat (saved history is kept)',
  icon: 'restart_alt',
  execute: async () => {
    document.getElementById('search-input').value = '';
    if (window._chips) {
      window._chips.deactivate('force_code');
      window._chips.updateMode('app');
    }
    if (window._ui && window._ui.resetAISession) {
      await window._ui.resetAISession();
    } else {
      window._ui.clearResults();
      await window.trim.cleanup();
    }
    document.getElementById('search-input').dispatchEvent(new Event('input'));
  },
});

register('/history', {
  description: 'Browse past AI conversations',
  icon: 'history',
  execute: () => {
    const input = document.getElementById('search-input');
    input.value = '? ';
    if (window._inputRouter) window._inputRouter.refreshInputDecor(input);
    input.setSelectionRange(2, 2);
    input.focus();
    if (window._ui && window._ui.showConversationHistory) {
      window._ui.showConversationHistory('ai');
    }
  },
});

function search(input) {
  const q = input.toLowerCase().trim();
  return [...registry.values()]
    .filter(cmd => cmd.name.startsWith(q) || cmd.name.includes(q))
    .map(cmd => ({
      type: 'command',
      icon: cmd.icon,
      title: cmd.name,
      subtitle: cmd.description,
      action: cmd.execute,
    }));
}

window._commands = { search, register };
})();
