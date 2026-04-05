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
      { type: 'command', icon: 'search', title: 'app name', subtitle: 'Search and launch installed apps' },
      { type: 'command', icon: 'auto_awesome', title: '? question', subtitle: 'Ask Gemini Flash AI (press Enter to send)' },
      { type: 'command', icon: 'auto_awesome', title: '?? question', subtitle: 'Ask Gemini Pro AI (press Enter to send)' },
      { type: 'command', icon: 'function', title: 'cs: expression', subtitle: 'Math solver — step-by-step with LaTeX and Python' },
      { type: 'command', icon: 'calculate', title: 'c: expression', subtitle: 'Calculator — e.g. c: 2^10 + sqrt(144)' },
      { type: 'command', icon: 'folder_open', title: 'f: path', subtitle: 'Browse folders and files' },
      { type: 'command', icon: 'attach_file', title: '#filename', subtitle: 'Reference a file in AI queries (Tab to select)' },
      { type: 'command', icon: 'terminal', title: '/ command', subtitle: 'Run commands — /settings, /reload, /clear' },
    ];
    window._ui.renderResults(helpResults);
  },
});
register('/settings', {
  description: 'Open Trim settings',
  icon: 'settings',
  execute: () => window._settings.open(),
});

register('/reload', {
  description: 'Reload Trim UI',
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
