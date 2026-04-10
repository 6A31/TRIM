const { dialog, globalShortcut } = require('electron');
const windowManager = require('./windowManager');
const { DEFAULT_SHORTCUT } = require('../shared/constants');

let currentShortcut = null;

function register(shortcut) {
  shortcut = shortcut || DEFAULT_SHORTCUT;

  // Unregister previous shortcut if changing
  if (currentShortcut) {
    try { globalShortcut.unregister(currentShortcut); } catch {}
  }

  let ok;
  try {
    ok = globalShortcut.register(shortcut, () => {
      windowManager.toggle();
    });
  } catch (err) {
    console.error(`Failed to register global shortcut: ${shortcut}`, err.message);
    return false;
  }
  if (!ok) {
    console.error(`Failed to register global shortcut: ${shortcut}`);
    dialog.showErrorBox(
      'TRIM - Shortcut Conflict',
      `Could not register ${shortcut}. Another app may be using it.\n\nClose the conflicting app and restart TRIM.`,
    );
    return false;
  }
  currentShortcut = shortcut;
  return true;
}

function unregister() {
  globalShortcut.unregisterAll();
  currentShortcut = null;
}

function getCurrent() {
  return currentShortcut;
}

module.exports = { register, unregister, getCurrent };
