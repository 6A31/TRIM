const { app, ipcMain } = require('electron');
const windowManager = require('./windowManager');
const globalHotkey = require('./globalHotkey');
const { registerHandlers } = require('./ipcHandlers');
const { IPC } = require('../shared/constants');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager.show();
  });

  app.whenReady().then(() => {
    windowManager.create();
    globalHotkey.register();
    registerHandlers(ipcMain);

    ipcMain.on(IPC.HIDE_WINDOW, () => {
      windowManager.hide();
    });

    ipcMain.handle('trim:resize-window', (_e, height) => {
      windowManager.resize(height);
    });
  });

  app.on('will-quit', () => {
    globalHotkey.unregister();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
