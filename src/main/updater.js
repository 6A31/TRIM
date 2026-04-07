const { autoUpdater } = require('electron-updater');
const { IPC } = require('../shared/constants');

function init(win) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send(IPC.UPDATE_READY);
  });

  // Check after 10s so it doesn't compete with startup
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10000);
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

module.exports = { init, quitAndInstall };
