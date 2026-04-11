const { app, ipcMain, Menu, screen } = require('electron');
const windowManager = require('./windowManager');
const globalHotkey = require('./globalHotkey');
const updater = require('./updater');
const { registerHandlers, loadSettingsSync } = require('./ipcHandlers');
const { IPC } = require('../shared/constants');

app.setName('TRIM');

// On macOS, hide the dock icon so TRIM doesn't appear in the app switcher.
// It's a utility launcher - it should behave like Spotlight, not a regular app.
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Set an explicit minimal application menu.
// On macOS this prevents the "representedObject is not a
// WeakPtrToElectronMenuModelAsNSObject" SIGTRAP crash that occurs when
// Electron auto-creates a default menu in a dockless/frameless app under
// heavy IPC load (e.g. f: deep scan streaming).
// The Edit submenu preserves standard Cmd+C/V/X/A shortcuts.
Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform === 'darwin' ? [{
    label: app.name,
    submenu: [{ role: 'quit' }],
  }] : []),
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
]));

// On macOS, hide the dock icon so TRIM doesn't appear in the app switcher.
// It's a utility launcher - it should behave like Spotlight, not a regular app.
if (process.platform === 'darwin') {
  app.dock.hide();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager.show();
  });

  app.whenReady().then(() => {
    windowManager.create();
    const settings = loadSettingsSync();
    globalHotkey.register(settings.shortcut);
    registerHandlers(ipcMain);

    ipcMain.on(IPC.HIDE_WINDOW, () => {
      windowManager.hide();
    });

    ipcMain.handle('trim:resize-window', (_e, height) => {
      windowManager.resize(height);
    });

    ipcMain.handle(IPC.GET_DISPLAY_SCALE, () => {
      return screen.getPrimaryDisplay().scaleFactor;
    });

    ipcMain.on(IPC.QUIT_AND_INSTALL, () => {
      updater.quitAndInstall();
    });

    ipcMain.on(IPC.SUPPRESS_BLUR, (_e, flag) => {
      windowManager.suppressBlur(flag);
    });

    updater.init(windowManager.getWindow());
  });

  app.on('will-quit', () => {
    globalHotkey.unregister();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    windowManager.show();
  });
}
