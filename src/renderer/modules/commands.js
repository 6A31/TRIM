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
      { type: 'command', icon: 'image', title: 'Ctrl+V image', subtitle: 'Paste a screenshot or image into AI chat for analysis' },
      { type: 'command', icon: 'attach_file', title: '#filename', subtitle: 'Attach a file to your AI query (Tab to autocomplete)' },
      { type: 'command', icon: 'calculate', title: 'c: expression', subtitle: 'Math — evaluate, solve, plot, derive, integrate, factor' },
      { type: 'command', icon: 'folder_open', title: 'f: path', subtitle: 'Browse and open files and folders on your system' },
      { type: 'command', icon: 'terminal', title: '/ command', subtitle: '/settings, /clear (reset AI), /reload, /help' },
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
  description: 'Clear search, AI context, and temp files',
  icon: 'clear_all',
  execute: () => {
    document.getElementById('search-input').value = '';
    window._ui.clearResults();
    if (window._chips) {
      window._chips.deactivate('force_code');
      window._chips.updateMode('app');
    }
    window.trim.cleanup();
    document.getElementById('search-input').dispatchEvent(new Event('input'));
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
