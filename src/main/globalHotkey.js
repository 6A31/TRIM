const { globalShortcut } = require('electron');
const windowManager = require('./windowManager');

function register() {
  globalShortcut.register('CommandOrControl+Space', () => {
    windowManager.toggle();
  });
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregister };
