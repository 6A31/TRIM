const { globalShortcut } = require('electron');
const windowManager = require('./windowManager');

function register() {
  // Cmd+Space conflicts with Spotlight on macOS; use Option+Space there instead.
  const shortcut = process.platform === 'darwin' ? 'Alt+Space' : 'CommandOrControl+Space';
  const ok = globalShortcut.register(shortcut, () => {
    windowManager.toggle();
  });
  if (!ok) {
    console.error(`Failed to register global shortcut: ${shortcut}`);
  }
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregister };
