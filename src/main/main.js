const { app, ipcMain, screen } = require('electron');
const windowManager = require('./windowManager');
const globalHotkey = require('./globalHotkey');
const updater = require('./updater');
const { registerHandlers } = require('./ipcHandlers');
const { IPC } = require('../shared/constants');

app.setName('TRIM');

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

    ipcMain.handle(IPC.GET_DISPLAY_SCALE, () => {
      return screen.getPrimaryDisplay().scaleFactor;
    });

    ipcMain.on(IPC.QUIT_AND_INSTALL, () => {
      updater.quitAndInstall();
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
