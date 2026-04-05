const registry = new Map();

function register(name, opts) {
  registry.set(name.toLowerCase(), { name, ...opts });
}

// Built-in commands
register('/settings', {
  description: 'Open Trim settings',
  icon: 'settings',
  execute: () => window._settings.open(),
});

register('/reload', {
  description: 'Reload Trim',
  icon: 'refresh',
  execute: () => location.reload(),
});

register('/clear', {
  description: 'Clear search and results',
  icon: 'clear_all',
  execute: () => {
    document.getElementById('search-input').value = '';
    document.getElementById('search-input').dispatchEvent(new Event('input'));
  },
});

register('/quit', {
  description: 'Close Trim',
  icon: 'close',
  execute: () => window.close(),
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
